import { describe, expect, it } from 'vitest'
import {
  extractDescription,
  parseTemplateParams,
  stripMarkup
} from '../../../src/main/catalog/wikitext'

// Fixtures are real pages from zelda-64-mods.fandom.com, trimmed - the point
// of these tests is the wiki's actual conventions, not invented markup.

const THE_MISSING_LINK = `{{Infobox_mod|image1=The Missing Link.jpg|creator=Kaze, CDi-Fails, Zel|year=July 25, 2020|download=https://www.romhacking.net/hacks/5334/|alternative_download=https://hylianmodding.com/mods/the_missing_link|status=Complete|rom_version=*Multiple versions}}

'''The Missing Link''' is a ROM hack created by Kaze, CDi-Fails and Zel.

==Description==
''This mini-adventure is set in between Ocarina of Time and Majora's Mask. It follows Link on his quest to find Navi, his fairy companion from the first N64 Zelda game.''

==Map==
[[File:TML map.png|left|frameless|400x400px]]
`

// Half the pages have no ==Description==; the blurb is an italic run in the
// lead instead, under a line of wiki boilerplate.
const CRYSTAL_CLOCKS = `{{Infobox_mod|image1=Crystal Clocks.png|creator=SuperZambez|status=Complete}}
Crystal Clocks is a ROM hack created by SuperZambez and participated in the [[2023 Escape Room Competition]].

''It's a beautiful night, and you're headed off to stargaze with Saria and Mido. Surely, the path to get there is simple!''

==Gallery==
<gallery>
File:Crystal1.png
</gallery>
`

describe('parseTemplateParams', () => {
  it('reads the infobox parameters', () => {
    const params = parseTemplateParams(THE_MISSING_LINK, 'Infobox_mod')

    expect(params?.creator).toBe('Kaze, CDi-Fails, Zel')
    expect(params?.image1).toBe('The Missing Link.jpg')
    expect(params?.status).toBe('Complete')
    expect(params?.download).toBe('https://www.romhacking.net/hacks/5334/')
  })

  it('accepts the space-separated spelling of the template name', () => {
    expect(parseTemplateParams('{{Infobox mod|creator=Someone}}', 'Infobox_mod')?.creator).toBe(
      'Someone'
    )
  })

  it('returns null when the page has no such template', () => {
    expect(parseTemplateParams("'''Just prose.'''", 'Infobox_mod')).toBeNull()
  })

  it('does not end a parameter on a pipe inside a link or nested template', () => {
    const params = parseTemplateParams(
      '{{Infobox_mod|creator=[[User:Zel|Zel]]|status={{Colour|green|Complete}}|year=2020}}',
      'Infobox_mod'
    )

    expect(params?.creator).toBe('[[User:Zel|Zel]]')
    expect(params?.status).toBe('{{Colour|green|Complete}}')
    expect(params?.year).toBe('2020')
  })
})

describe('stripMarkup', () => {
  it('unwraps links and drops structural markup', () => {
    expect(stripMarkup("'''Bold''' and [[Page|a label]] and [[Other]].")).toBe(
      'Bold and a label and Other.'
    )
    expect(stripMarkup('[[File:Map.png|left|400px]]Text')).toBe('Text')
    expect(stripMarkup('See [https://example.test the site].')).toBe('See the site.')
    expect(stripMarkup('<gallery>File:A.png</gallery>Text')).toBe('Text')
  })

  it('drops category links rather than unwrapping them into the prose', () => {
    expect(
      stripMarkup('A short hack.\n[[Category:Mods]]\n[[Category:Unfinished Mods]]')
    ).toBe('A short hack.')
  })
})

describe('extractDescription', () => {
  it('prefers the Description section', () => {
    expect(extractDescription(THE_MISSING_LINK)).toBe(
      "This mini-adventure is set in between Ocarina of Time and Majora's Mask. It follows Link on his quest to find Navi, his fairy companion from the first N64 Zelda game."
    )
  })

  it("falls back to the lead's italic blurb over the wiki boilerplate", () => {
    expect(extractDescription(CRYSTAL_CLOCKS)).toBe(
      "It's a beautiful night, and you're headed off to stargaze with Saria and Mido. Surely, the path to get there is simple!"
    )
  })

  it('uses the plain lead when there is no italic blurb', () => {
    const page = '{{Infobox_mod|creator=Someone}}\nA short hack with three new rooms.\n'
    expect(extractDescription(page)).toBe('A short hack with three new rooms.')
  })

  it('truncates a long blurb on a word boundary', () => {
    const long = `{{Infobox_mod|creator=X}}\n==Description==\n${'word '.repeat(300)}`
    const description = extractDescription(long)

    expect(description).toMatch(/…$/)
    expect(description?.length).toBeLessThanOrEqual(501)
    expect(description).not.toMatch(/wor…$/)
  })

  it('returns null for a page with no prose', () => {
    expect(extractDescription('{{Infobox_mod|creator=Someone}}')).toBeNull()
  })
})
