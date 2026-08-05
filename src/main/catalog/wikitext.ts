/**
 * Just enough MediaWiki markup handling to read a mod page's infobox and
 * blurb. Deliberately not a general wikitext parser: the Zelda 64 Mods wiki
 * puts everything this app needs in one flat {{Infobox_mod}} plus a short
 * prose intro, and a real parser would be far more machinery than that earns.
 */

/** Splits on `separator` at brace/bracket depth zero, so a `|` inside a
 *  nested template or a [[link|label]] doesn't end a parameter. */
function splitTopLevel(body: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0

  for (let i = 0; i < body.length; i++) {
    if (body.startsWith('{{', i) || body.startsWith('[[', i)) {
      depth++
      i++
    } else if (body.startsWith('}}', i) || body.startsWith(']]', i)) {
      depth = Math.max(0, depth - 1)
      i++
    } else if (depth === 0 && body.startsWith(separator, i)) {
      parts.push(body.slice(start, i))
      start = i + separator.length
    }
  }

  parts.push(body.slice(start))
  return parts
}

/** Body of the first `{{name|...}}` call, brace-counted so a nested template
 *  doesn't close it early. */
function templateBody(wikitext: string, name: string): string | null {
  const opener = new RegExp(`\\{\\{\\s*${name.replace(/[_ ]/g, '[_ ]')}\\s*[|}]`, 'i')
  const match = opener.exec(wikitext)
  if (!match) return null

  let depth = 0
  for (let i = match.index; i < wikitext.length - 1; i++) {
    if (wikitext.startsWith('{{', i)) {
      depth++
      i++
    } else if (wikitext.startsWith('}}', i)) {
      depth--
      if (depth === 0) return wikitext.slice(match.index + 2, i)
      i++
    }
  }
  return null
}

/**
 * Named parameters of a template call, lowercased. Positional parameters are
 * ignored - this infobox doesn't use any.
 */
export function parseTemplateParams(
  wikitext: string,
  templateName: string
): Record<string, string> | null {
  const body = templateBody(wikitext, templateName)
  if (body === null) return null

  const params: Record<string, string> = {}
  for (const part of splitTopLevel(body, '|').slice(1)) {
    const equals = part.indexOf('=')
    if (equals === -1) continue
    const key = part.slice(0, equals).trim().toLowerCase()
    const value = part.slice(equals + 1).trim()
    if (key) params[key] = value
  }
  return params
}

/** Wikitext down to readable prose. Anything structural is dropped rather
 *  than approximated - a stray '' or [[ in a mod row looks worse than a
 *  slightly shorter blurb. */
export function stripMarkup(wikitext: string): string {
  return (
    wikitext
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
      .replace(/<gallery[\s\S]*?<\/gallery>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\{\{[\s\S]*?\}\}/g, '')
      // File, image and category links carry no prose - a category link is
      // page filing, and unwrapping it to its label leaks "Category:Mods
      // Category:Unfinished Mods" onto the end of the blurb. Other links keep
      // their label.
      .replace(/\[\[(?:File|Image|Category):[\s\S]*?\]\]/gi, '')
      .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
      .replace(/\[\[([^\]]*)\]\]/g, '$1')
      .replace(/\[(?:https?:)\/\/\S+\s+([^\]]*)\]/g, '$1')
      .replace(/\[(?:https?:)\/\/\S+\]/g, '')
      .replace(/'{2,}/g, '')
      .replace(/^[*#:;]+\s*/gm, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim()
  )
}

/** Everything before the first section heading. The infobox sits in here too,
 *  but it carries no prose and stripMarkup drops it. */
function leadSection(wikitext: string): string {
  const heading = wikitext.search(/^\s*==/m)
  return heading === -1 ? wikitext : wikitext.slice(0, heading)
}

function namedSection(wikitext: string, name: string): string | null {
  const match = new RegExp(`^[ \\t]*={2,}[ \\t]*${name}[ \\t]*={2,}[ \\t]*$`, 'im').exec(wikitext)
  if (!match) return null
  const rest = wikitext.slice(match.index + match[0].length)
  const next = rest.search(/^\s*==/m)
  return next === -1 ? rest : rest.slice(0, next)
}

const MAX_DESCRIPTION = 500

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text
  const cut = text.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * A mod's blurb. Half the pages have an explicit ==Description== section; the
 * rest open with prose instead. Either way the author's own pitch is usually
 * the italicised paragraph ("''It's a beautiful night...''"), with the
 * surrounding text being wiki boilerplate ("X is a ROM hack created by Y"), so
 * an italic run wins when there's a substantial one.
 */
export function extractDescription(wikitext: string): string | null {
  const chunk = namedSection(wikitext, 'Description') ?? leadSection(wikitext)

  const italics = [...chunk.matchAll(/''+([^'][\s\S]*?)''+/g)]
    .map((match) => stripMarkup(match[1]))
    .filter((text) => text.length >= 60)

  const text = italics.length > 0 ? italics.join(' ') : stripMarkup(chunk)
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed ? truncate(collapsed, MAX_DESCRIPTION) : null
}
