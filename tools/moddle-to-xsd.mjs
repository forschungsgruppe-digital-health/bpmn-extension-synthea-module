#!/usr/bin/env node
//
// Generate an XML Schema (XSD) for a bpmn.io extension FROM its moddle
// descriptor, so the moddle descriptor stays the single source of truth.
//
// The generated XSD lets XSD-native / non-JS consumers validate the STRUCTURE
// of your extension data (alongside BPMN20.xsd) — it does NOT replace the
// bpmnlint plugin, which enforces the semantics (required attributes,
// cross-element rules) that XSD cannot express.
//
// Usage:
//   node tools/moddle-to-xsd.mjs                 # write <descriptor>.xsd next to the descriptor
//   node tools/moddle-to-xsd.mjs --check         # exit 1 if the on-disk XSD is stale (CI drift guard)
//   node tools/moddle-to-xsd.mjs --descriptor extension/model/other.json
//
// Supported descriptor subset (the common case; anything else is warned about):
//   - types with "superClass": ["Element"] (top-level extension elements)
//   - isAttr properties        -> XSD attributes (optional; "required" is a lint concern)
//   - isBody property          -> simpleContent text (or mixed content if combined with children)
//   - typed child properties   -> element refs to the referenced type's global element
//   - isMany                   -> maxOccurs="unbounded"
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const XSD_NS = 'http://www.w3.org/2001/XMLSchema';

// moddle primitive -> XSD built-in type
const PRIMITIVES = {
  String: 'xsd:string',
  Boolean: 'xsd:boolean',
  Integer: 'xsd:int',
  Real: 'xsd:double'
};

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const tagName = (name, tagAlias) => (tagAlias === 'lowerCase' ? lowerFirst(name) : name);

/**
 * Serialized XML tags of the descriptor's top-level extension elements
 * (types whose superClass is "Element" — i.e. those that may appear directly
 * under bpmn:extensionElements). Used by the dual-validation canary.
 */
export function extensionTags(descriptor) {
  const tagAlias = (descriptor.xml || {}).tagAlias;
  return (descriptor.types || [])
    .filter((t) => (t.superClass || []).includes('Element'))
    .map((t) => tagName(t.name, tagAlias));
}

const xmlEscapeAttr = (v) =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/**
 * Build an XSD string for the given moddle descriptor.
 * @returns {{ xsd: string, warnings: string[] }}
 */
export function generateXsd(descriptor) {
  const { uri, prefix, types = [], xml = {}, version } = descriptor;
  if (!uri || !prefix) {
    throw new Error('descriptor must define "uri" and "prefix"');
  }
  const tagAlias = xml.tagAlias;
  const warnings = [];

  // declared extension types: moddle type name -> serialized XML tag
  const declared = new Map(types.map((t) => [t.name, tagName(t.name, tagAlias)]));

  const attrLine = (p, indent) => {
    const type = PRIMITIVES[p.type] || 'xsd:string';
    if (!PRIMITIVES[p.type] && !p.isReference) {
      warnings.push(`attribute ${p.name}: non-primitive type "${p.type}" mapped to xsd:string`);
    }
    let s = `${indent}<xsd:attribute name="${p.name}" type="${type}"`;
    if (p.default !== undefined && p.default !== null) {
      s += ` default="${xmlEscapeAttr(p.default)}"`;
    }
    return s + '/>';
  };

  const childLine = (owner, p) => {
    const maxOccurs = p.isMany ? 'unbounded' : '1';
    if (declared.has(p.type)) {
      return `      <xsd:element ref="${prefix}:${declared.get(p.type)}" minOccurs="0" maxOccurs="${maxOccurs}"/>`;
    }
    if (PRIMITIVES[p.type]) {
      // primitive-valued child element (text content under its own tag)
      return `      <xsd:element name="${p.name}" type="${PRIMITIVES[p.type]}" minOccurs="0" maxOccurs="${maxOccurs}"/>`;
    }
    warnings.push(`${owner}.${p.name}: unknown element type "${p.type}" -> xsd:any (lax)`);
    return `      <xsd:any namespace="##any" processContents="lax" minOccurs="0" maxOccurs="${maxOccurs}"/>`;
  };

  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<!-- GENERATED from the moddle descriptor by tools/moddle-to-xsd.mjs. Do not edit by hand. -->');
  out.push('<!-- Scope: STRUCTURE only. Semantic rules (e.g. required attributes) live in the bpmnlint plugin. -->');
  if (version) {
    // Package SemVer (NOT the namespace `uri`, which is the contract version and
    // must not auto-bump). Release Please keeps this line in sync via the
    // x-release-please-version annotation; the generator stamps descriptor.version.
    out.push(`<!-- extension version ${version} (kept in sync by Release Please) x-release-please-version -->`);
  }
  out.push(`<xsd:schema xmlns:xsd="${XSD_NS}"`);
  out.push(`            xmlns:${prefix}="${uri}"`);
  out.push(`            targetNamespace="${uri}"`);
  out.push('            elementFormDefault="qualified"');
  out.push('            attributeFormDefault="unqualified">');
  out.push('');

  for (const t of types) {
    const supers = t.superClass || [];
    const unknownSupers = supers.filter((s) => s !== 'Element' && declared.has(s));
    if (unknownSupers.length) {
      warnings.push(`type ${t.name}: superClass ${JSON.stringify(unknownSupers)} not modelled as XSD inheritance (treated as standalone)`);
    }
    if (supers.some((s) => s !== 'Element' && !declared.has(s))) {
      warnings.push(`type ${t.name}: non-Element superClass ignored`);
    }

    const props = t.properties || [];
    const attrs = props.filter((p) => p.isAttr);
    const body = props.find((p) => p.isBody);
    const children = props.filter((p) => !p.isAttr && !p.isBody);
    const tag = declared.get(t.name);
    const typeName = `${prefix}:t${t.name}`;

    out.push(`  <xsd:element name="${tag}" type="${typeName}"/>`);

    if (body && children.length) {
      // text + child elements -> mixed content
      warnings.push(`type ${t.name}: has both body and child elements -> emitted as mixed content`);
      out.push(`  <xsd:complexType name="t${t.name}" mixed="true">`);
      out.push('    <xsd:sequence>');
      for (const c of children) out.push(childLine(t.name, c));
      out.push('    </xsd:sequence>');
      for (const a of attrs) out.push(attrLine(a, '    '));
      out.push('  </xsd:complexType>');
    } else if (body) {
      // text content + attributes -> simpleContent
      const base = PRIMITIVES[body.type] || 'xsd:string';
      out.push(`  <xsd:complexType name="t${t.name}">`);
      out.push('    <xsd:simpleContent>');
      out.push(`      <xsd:extension base="${base}">`);
      for (const a of attrs) out.push(attrLine(a, '        '));
      out.push('      </xsd:extension>');
      out.push('    </xsd:simpleContent>');
      out.push('  </xsd:complexType>');
    } else if (children.length) {
      // child elements + attributes
      out.push(`  <xsd:complexType name="t${t.name}">`);
      out.push('    <xsd:sequence>');
      for (const c of children) out.push(childLine(t.name, c));
      out.push('    </xsd:sequence>');
      for (const a of attrs) out.push(attrLine(a, '    '));
      out.push('  </xsd:complexType>');
    } else {
      // attributes only (or empty)
      if (attrs.length) {
        out.push(`  <xsd:complexType name="t${t.name}">`);
        for (const a of attrs) out.push(attrLine(a, '    '));
        out.push('  </xsd:complexType>');
      } else {
        out.push(`  <xsd:complexType name="t${t.name}"/>`);
      }
    }
    out.push('');
  }

  out.push('</xsd:schema>');
  return { xsd: out.join('\n') + '\n', warnings };
}

// ---- CLI ---------------------------------------------------------------
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const dIdx = args.indexOf('--descriptor');
  const descriptorPath =
    dIdx >= 0 && args[dIdx + 1]
      ? args[dIdx + 1]
      : fileURLToPath(new URL('../extension/model/myExtension.json', import.meta.url));

  const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8'));
  const { xsd, warnings } = generateXsd(descriptor);
  warnings.forEach((w) => console.error(`warning: ${w}`));

  const outPath = descriptorPath.replace(/\.json$/, '.xsd');

  if (check) {
    let current = '';
    try {
      current = readFileSync(outPath, 'utf8');
    } catch {
      console.error(`MISSING ${outPath} — run "npm run xsd:gen" and commit it.`);
      process.exit(1);
    }
    if (current !== xsd) {
      console.error(`STALE ${outPath} — regenerate with "npm run xsd:gen" and commit it.`);
      process.exit(1);
    }
    console.log(`up to date: ${outPath}`);
  } else {
    writeFileSync(outPath, xsd);
    console.log(`wrote ${outPath}`);
  }
}
