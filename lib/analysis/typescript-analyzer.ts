/**
 * lib/analysis/typescript-analyzer.ts
 *
 * AST-based TypeScript analyzer using ts-morph.
 * Zero regex for structural analysis — every finding is backed by the compiler.
 *
 * Design:
 *   - Two in-memory SourceFiles (before / after) parsed by a single Project
 *   - Exported interfaces, type aliases (object & scalar), and functions compared
 *   - Type aliases that resolve to object types are unwrapped via getApparentProperties()
 *     so Entity<{ bio: string }> diffs correctly against Entity<{}>
 *   - Deleted files: pass after='' — all exports are treated as removed
 *   - Added files: pass before='' — no removals produced, only additions
 *   - findPropertyUsages() returns 4 usage categories for AST-verified evidence
 */

import {
  Project,
  Node,
  SourceFile,
  PropertySignature,
} from 'ts-morph'
import type {
  Finding,
  AnalysisError,
  ChangeType,
  Severity,
  EvidenceItem,
  UsageType,
} from './types'

// ─── File filter ──────────────────────────────────────────────────────────────

const SKIP_PATTERNS = [
  /\.d\.ts$/i,
  /\.(test|spec)\.(ts|tsx)$/i,
  /(^|\/)(__tests__|node_modules|dist|build|\.next|coverage)\//,
]

export function shouldAnalyzeFile(path: string): boolean {
  if (!path.endsWith('.ts') && !path.endsWith('.tsx')) return false
  return !SKIP_PATTERNS.some(p => p.test(path))
}

// ─── Internal shapes ──────────────────────────────────────────────────────────

interface PropInfo {
  /** Normalized type string for comparison (whitespace-collapsed, readonly stripped) */
  typeText:    string
  /** Original source text for human display */
  displayType: string
  optional:    boolean
}

interface ObjTypeInfo {
  props: Map<string, PropInfo>
  kind:  'interface' | 'type_object'
}

interface FuncInfo {
  params:     { name: string; typeText: string; optional: boolean }[]
  returnType: string
}

interface FileStructure {
  /** Exported interfaces and object type aliases, keyed by name */
  objTypes:  Map<string, ObjTypeInfo>
  /** Exported scalar type aliases (type Foo = string), keyed by name */
  scalars:   Map<string, string>
  /** Exported functions (incl. arrow functions assigned to const) */
  functions: Map<string, FuncInfo>
}

// ─── Severity map ─────────────────────────────────────────────────────────────

const SEV: Record<ChangeType, Severity> = {
  removed_endpoint:     'high',
  removed_interface:    'high',
  removed_field:        'high',
  changed_type:         'high',
  removed_parameter:    'high',
  changed_required:     'high',
  added_required_field: 'high',
  changed_return_type:  'medium',
  added_optional_field: 'safe',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeType(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/\breadonly\b\s*/g, '').trim()
}

function dedup(
  findings: Omit<Finding, 'evidence'>[],
): Omit<Finding, 'evidence'>[] {
  const seen = new Set<string>()
  return findings.filter(f => {
    const key = `${f.changeType}::${f.affectedValue}::${f.sourceFile}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── Project factory ──────────────────────────────────────────────────────────
// useInMemoryFileSystem avoids touching disk. strict:false tolerates missing
// import targets (we analyze files in isolation).

function makeProject(): Project {
  return new Project({
    useInMemoryFileSystem:       true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      strict:  false,
      noEmit:  true,
    },
  })
}

// ─── Structure extraction ─────────────────────────────────────────────────────

/**
 * Skip property names that come from Object.prototype or internal TypeScript
 * infrastructure (present in apparent property lists for intersection types).
 */
const SKIP_PROP_NAMES = new Set([
  '__index', '__type',
  'constructor', 'toString', 'toLocaleString', 'hasOwnProperty',
  'valueOf', 'isPrototypeOf', 'propertyIsEnumerable',
  '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
  '__proto__', 'then', 'catch', 'finally',   // Promise leak in some union types
])

function extractStructure(source: SourceFile): FileStructure {
  const objTypes  = new Map<string, ObjTypeInfo>()
  const scalars   = new Map<string, string>()
  const functions = new Map<string, FuncInfo>()

  // ── Interfaces ────────────────────────────────────────────────────────────
  for (const iface of source.getInterfaces()) {
    if (!iface.isExported()) continue

    const name  = iface.getName()
    const props = new Map<string, PropInfo>()

    for (const member of iface.getMembers()) {
      if (!Node.isPropertySignature(member)) continue
      const p = member as PropertySignature

      // Use getType().getText() for comparison (normalized), getTypeNode()?.getText()
      // for display (preserves original quote style, e.g. 'USD' vs "USD").
      const typeText    = normalizeType(p.getType().getText(p))
      const displayType = p.getTypeNode()?.getText() ?? typeText

      props.set(p.getName(), { typeText, displayType, optional: p.hasQuestionToken() })
    }

    objTypes.set(name, { props, kind: 'interface' })
  }

  // ── Type aliases ──────────────────────────────────────────────────────────
  for (const ta of source.getTypeAliases()) {
    if (!ta.isExported()) continue
    const name = ta.getName()
    if (objTypes.has(name)) continue   // interface already registered

    const type = ta.getType()

    // Object and intersection types: try to enumerate apparent properties.
    // This handles Entity<{ bio: string }> correctly by resolving the generic.
    if (type.isObject() || type.isIntersection()) {
      const props = new Map<string, PropInfo>()
      let resolved = true

      try {
        for (const sym of type.getApparentProperties()) {
          const symName = sym.getName()
          if (SKIP_PROP_NAMES.has(symName)) continue
          if (/^[0-9]/.test(symName)) continue    // numeric index signatures

          const symType    = sym.getTypeAtLocation(ta)
          const typeText   = normalizeType(symType.getText(ta))
          const displayType = typeText

          // Optionality: check if the type includes `undefined`, or the property
          // declaration has a question token.
          const isOptional =
            symType.isUndefined() ||
            symType.getUnionTypes().some(t => t.isUndefined()) ||
            sym.getDeclarations().some(
              d => Node.isPropertySignature(d) &&
                   (d as PropertySignature).hasQuestionToken()
            )

          props.set(symName, { typeText, displayType, optional: isOptional })
        }
      } catch {
        resolved = false
      }

      if (resolved && props.size > 0) {
        objTypes.set(name, { props, kind: 'type_object' })
        continue
      }
    }

    // Scalar / non-object type alias (e.g. type UserId = string)
    const rawText = ta.getTypeNode()?.getText() ?? type.getText(ta)
    scalars.set(name, rawText)
  }

  // ── Exported functions (declarations + arrow/function-expr variables) ─────
  for (const fn of source.getFunctions()) {
    if (!fn.isExported()) continue
    const name = fn.getName()
    if (!name) continue

    functions.set(name, {
      params: fn.getParameters().map(p => ({
        name:     p.getName(),
        typeText: normalizeType(p.getType().getText(p)),
        optional: p.isOptional(),
      })),
      returnType: normalizeType(fn.getReturnType().getText(fn)),
    })
  }

  for (const stmt of source.getVariableStatements()) {
    if (!stmt.isExported()) continue
    for (const decl of stmt.getDeclarations()) {
      const init = decl.getInitializer()
      if (!init) continue
      if (!Node.isArrowFunction(init) && !Node.isFunctionExpression(init)) continue

      const name = decl.getName()
      functions.set(name, {
        params: init.getParameters().map(p => ({
          name:     p.getName(),
          typeText: normalizeType(p.getType().getText(p)),
          optional: p.isOptional(),
        })),
        returnType: normalizeType(init.getReturnType().getText(init)),
      })
    }
  }

  return { objTypes, scalars, functions }
}

// ─── Main analyzer ────────────────────────────────────────────────────────────

export function analyzeTypeScriptFile(
  filePath: string,
  before:   string,
  after:    string,
): { findings: Omit<Finding, 'evidence'>[]; errors: AnalysisError[] } {
  const errors: AnalysisError[] = []

  // Both empty — nothing to analyze (shouldn't happen in practice)
  if (!before && !after) return { findings: [], errors }

  let bStruct: FileStructure
  let aStruct: FileStructure

  try {
    const project = makeProject()
    // Use unique but stable names so TypeScript doesn't cross-reference them
    const bSrc = project.createSourceFile('__before__.ts', before, { overwrite: true })
    const aSrc = project.createSourceFile('__after__.ts',  after,  { overwrite: true })
    bStruct = extractStructure(bSrc)
    aStruct = extractStructure(aSrc)
  } catch (e: unknown) {
    errors.push({ file: filePath, phase: 'parse', message: String(e) })
    return { findings: [], errors }
  }

  const findings: Omit<Finding, 'evidence'>[] = []

  // ── Object type comparison (interfaces + object type aliases) ────────────

  for (const [name, bType] of bStruct.objTypes) {
    const aType = aStruct.objTypes.get(name)

    // Removed entirely
    if (!aType) {
      const kind = bType.kind === 'interface' ? 'Interface' : 'Type'
      findings.push({
        changeType:    'removed_interface',
        severity:      SEV.removed_interface,
        sourceFile:    filePath,
        affectedValue: name,
        description:   `${kind} '${name}' was removed`,
        beforeSchema:  `{ ${[...bType.props.keys()].join(', ')} }`,
        confidence:    95,
      })
      continue
    }

    // Property-level comparison
    for (const [prop, bProp] of bType.props) {
      const aProp = aType.props.get(prop)

      // Field removed
      if (!aProp) {
        findings.push({
          changeType:    'removed_field',
          severity:      SEV.removed_field,
          sourceFile:    filePath,
          affectedValue: `${name}.${prop}`,
          description:   `Property '${prop}' removed from '${name}'`,
          beforeSchema:  `${prop}${bProp.optional ? '?' : ''}: ${bProp.displayType}`,
          confidence:    95,
        })
        continue
      }

      // Type changed
      if (bProp.typeText !== aProp.typeText) {
        findings.push({
          changeType:    'changed_type',
          severity:      SEV.changed_type,
          sourceFile:    filePath,
          affectedValue: `${name}.${prop}`,
          description:   `Type of '${prop}' changed in '${name}': ${bProp.displayType} → ${aProp.displayType}`,
          beforeSchema:  bProp.displayType,
          afterSchema:   aProp.displayType,
          confidence:    90,
        })
      }

      // Optional → required (breaking: callers that omit the field now fail)
      if (bProp.optional && !aProp.optional) {
        findings.push({
          changeType:    'changed_required',
          severity:      SEV.changed_required,
          sourceFile:    filePath,
          affectedValue: `${name}.${prop}`,
          description:   `'${prop}' in '${name}' changed from optional to required`,
          beforeSchema:  `${prop}?: ${bProp.displayType}`,
          afterSchema:   `${prop}: ${aProp.displayType}`,
          confidence:    90,
        })
      }
    }

    // New fields in after
    for (const [prop, aProp] of aType.props) {
      if (bType.props.has(prop)) continue

      if (aProp.optional) {
        findings.push({
          changeType:    'added_optional_field',
          severity:      SEV.added_optional_field,
          sourceFile:    filePath,
          affectedValue: `${name}.${prop}`,
          description:   `New optional property '${prop}' added to '${name}'`,
          afterSchema:   `${prop}?: ${aProp.displayType}`,
          confidence:    90,
        })
      } else {
        findings.push({
          changeType:    'added_required_field',
          severity:      SEV.added_required_field,
          sourceFile:    filePath,
          affectedValue: `${name}.${prop}`,
          description:   `New required property '${prop}' added to '${name}'`,
          afterSchema:   `${prop}: ${aProp.displayType}`,
          confidence:    90,
        })
      }
    }
  }

  // ── Scalar type alias removal ─────────────────────────────────────────────

  for (const [name, bText] of bStruct.scalars) {
    if (!aStruct.scalars.has(name) && !aStruct.objTypes.has(name)) {
      findings.push({
        changeType:    'removed_interface',
        severity:      SEV.removed_interface,
        sourceFile:    filePath,
        affectedValue: name,
        description:   `Type alias '${name}' was removed`,
        beforeSchema:  bText,
        confidence:    92,
      })
    }
  }

  // ── Function comparison ───────────────────────────────────────────────────

  for (const [name, bFn] of bStruct.functions) {
    const aFn = aStruct.functions.get(name)

    if (!aFn) {
      // Function removed entirely
      if (bFn.params.length === 0 || bFn.params.every(p => p.optional)) {
        findings.push({
          changeType:    'removed_interface',
          severity:      SEV.removed_interface,
          sourceFile:    filePath,
          affectedValue: name,
          description:   `Exported function '${name}' was removed`,
          confidence:    90,
        })
      } else {
        // Report each required parameter as removed (more useful than "function removed")
        for (const p of bFn.params) {
          if (p.optional) continue
          findings.push({
            changeType:    'removed_parameter',
            severity:      SEV.removed_parameter,
            sourceFile:    filePath,
            affectedValue: `${name}(${p.name})`,
            description:   `Function '${name}' was removed`,
            beforeSchema:  `function ${name}(${bFn.params.map(p => `${p.name}: ${p.typeText}`).join(', ')}): ${bFn.returnType}`,
            confidence:    90,
          })
        }
      }
      continue
    }

    // Parameters reduced (positional comparison — the most common breaking case)
    for (let i = 0; i < bFn.params.length; i++) {
      const bp = bFn.params[i]!
      if (i >= aFn.params.length) {
        findings.push({
          changeType:    'removed_parameter',
          severity:      SEV.removed_parameter,
          sourceFile:    filePath,
          affectedValue: `${name}(${bp.name})`,
          description:   `Parameter '${bp.name}' removed from '${name}'`,
          beforeSchema:  `${name}(${bFn.params.map(p => `${p.name}: ${p.typeText}`).join(', ')})`,
          afterSchema:   `${name}(${aFn.params.map(p => `${p.name}: ${p.typeText}`).join(', ')})`,
          confidence:    88,
        })
      }
    }

    // Return type changed
    if (bFn.returnType !== aFn.returnType) {
      findings.push({
        changeType:    'changed_return_type',
        severity:      SEV.changed_return_type,
        sourceFile:    filePath,
        affectedValue: name,
        description:   `Return type of '${name}' changed: ${bFn.returnType} → ${aFn.returnType}`,
        beforeSchema:  bFn.returnType,
        afterSchema:   aFn.returnType,
        confidence:    85,
      })
    }
  }

  return { findings: dedup(findings), errors }
}

// ─── Property usage finder ─────────────────────────────────────────────────────
// Used by consumer-finder to AST-verify GitHub Search hits.

type UsageResult = Omit<EvidenceItem, 'confidence'>

export function findPropertyUsages(
  fileContent: string,
  filePath:    string,
  name:        string,
): UsageResult[] {
  const results: UsageResult[] = []
  const seen    = new Set<string>()
  const lines   = fileContent.split('\n')

  function add(lineNum: number, col: number, usageType: UsageType) {
    // Deduplicate: one entry per (line, usageType) pair
    const key = `${lineNum}:${usageType}`
    if (seen.has(key)) return
    seen.add(key)

    const snippet = (lines[lineNum - 1] ?? '').trim().slice(0, 250)
    if (!snippet) return  // skip blank lines

    results.push({
      repository:  '',   // filled in by consumer-finder
      filePath,
      lineNumber:  lineNum,
      column:      col,
      codeSnippet: snippet,
      usageType,
    })
  }

  try {
    const project = makeProject()
    const source  = project.createSourceFile('__consumer__.ts', fileContent, { overwrite: true })

    source.forEachDescendant(node => {
      // ── Direct property access: obj.name ───────────────────────────────
      if (Node.isPropertyAccessExpression(node)) {
        const nameNode = node.getNameNode()
        if (nameNode.getText() === name) {
          add(nameNode.getStartLineNumber(), nameNode.getStartLinePos(), 'direct_access')
        }
        return
      }

      // ── Destructuring: const { name } = obj  or  fn({ name }: T) ──────
      if (Node.isBindingElement(node)) {
        const nameNode = node.getNameNode()
        if (Node.isIdentifier(nameNode) && nameNode.getText() === name) {
          add(nameNode.getStartLineNumber(), nameNode.getStartLinePos(), 'destructuring')
        }
        return
      }

      // ── Object literal property: { name: value } ───────────────────────
      if (Node.isPropertyAssignment(node)) {
        const nameNode = node.getNameNode()
        if (nameNode.getText() === name) {
          add(nameNode.getStartLineNumber(), nameNode.getStartLinePos(), 'object_literal')
        }
        return
      }

      // ── Shorthand property: { name }  inside an object literal ─────────
      if (Node.isShorthandPropertyAssignment(node)) {
        const nameNode = node.getNameNode()
        if (nameNode.getText() === name) {
          add(nameNode.getStartLineNumber(), nameNode.getStartLinePos(), 'object_literal')
        }
        return
      }

      // ── Type annotation / type reference: param: Name  or  : Name[] ────
      // Catches function params, variable types, return types, generic args.
      // Does NOT catch import specifiers (those are ImportSpecifier nodes, not TypeReference).
      if (Node.isTypeReference(node)) {
        const typeName = node.getTypeName()
        if (Node.isIdentifier(typeName) && typeName.getText() === name) {
          // Skip if inside an import declaration
          let parent: Node | undefined = node.getParent()
          while (parent) {
            if (Node.isImportDeclaration(parent) || Node.isExportDeclaration(parent)) return
            parent = parent.getParent() ?? undefined
          }
          add(typeName.getStartLineNumber(), typeName.getStartLinePos(), 'type_annotation')
        }
        return
      }
    })
  } catch {
    // Gracefully return partial results on parse errors
  }

  return results
}

// ─── Endpoint usage finder ────────────────────────────────────────────────────
// Looks for URL paths in string literals, template literals, and fetch() calls.

export function findEndpointUsages(
  fileContent:  string,
  filePath:     string,
  endpointPath: string,
): UsageResult[] {
  // Extract the most specific path segment (non-parameter, length > 3)
  const normalized = endpointPath.replace(/\/\{[^}]+\}/g, '/')
  const segments   = normalized.split('/').filter(s => s.length > 3)
  const primary    = segments.find(s => s.length > 4) ?? segments[0]
  if (!primary) return []

  const results: UsageResult[] = []
  const seen    = new Set<number>()
  const lines   = fileContent.split('\n')

  function check(text: string, lineNum: number, col: number) {
    if (!text.includes(primary!)) return
    if (seen.has(lineNum)) return
    seen.add(lineNum)
    const snippet = (lines[lineNum - 1] ?? '').trim().slice(0, 250)
    if (!snippet) return
    results.push({
      repository:  '',
      filePath,
      lineNumber:  lineNum,
      column:      col,
      codeSnippet: snippet,
      usageType:   'string_literal',
    })
  }

  try {
    const project = makeProject()
    const source  = project.createSourceFile('__consumer__.ts', fileContent, { overwrite: true })

    source.forEachDescendant(node => {
      if (Node.isStringLiteral(node)) {
        check(node.getLiteralText(), node.getStartLineNumber(), node.getStartLinePos())
        return
      }

      if (Node.isNoSubstitutionTemplateLiteral(node)) {
        check(node.getLiteralText(), node.getStartLineNumber(), node.getStartLinePos())
        return
      }

      if (Node.isTemplateExpression(node)) {
        const lineNum = node.getStartLineNumber()
        const col     = node.getStartLinePos()
        // Check head literal
        check(node.getHead().getLiteralText(), lineNum, col)
        // Check each span's literal (the part between } and next ${ or closing `)
        for (const span of node.getTemplateSpans()) {
          try {
            check(span.getLiteral().getLiteralText(), lineNum, col)
          } catch {
            // Some template spans may not expose literal text — skip
          }
        }
        // Fallback: check raw node text to catch edge cases
        check(node.getText(), lineNum, col)
        return
      }
    })
  } catch {
    // Fallback to simple text search when ts-morph fails
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      if (!line.includes(primary)) continue
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue  // skip comments
      if (seen.has(i + 1)) continue
      seen.add(i + 1)
      results.push({
        repository:  '',
        filePath,
        lineNumber:  i + 1,
        column:      1,
        codeSnippet: trimmed.slice(0, 250),
        usageType:   'string_literal',
      })
    }
  }

  return results
}
