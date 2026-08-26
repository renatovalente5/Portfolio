#!/usr/bin/env node
/* 7-pages-yml — validar o .pages.yml com o esquema VERDADEIRO do Pages CMS.
 *
 * Porque é que isto existe: o .pages.yml não tem validação nenhuma do nosso lado. Uma
 * chave inventada não dá erro — o Pages CMS ignora-a com um aviso que ninguém lê, e a
 * configuração fica a fingir que faz algo. Foi assim que o `icon:` ficou aqui meses sem
 * fazer nada: não existe no esquema. E há pior: uma configuração que passa a validação
 * e ainda assim quebra o editor (ver o comentário no topo do .pages.yml).
 *
 * O que este passo faz:
 *   1. clona o pages-cms (raso) para _source/tmp/pages-cms
 *   2. instala zod/esbuild/js-yaml num sítio à parte (o repositório do site não ganha
 *      dependências: continua a gerar-se com um `node _source/build.mjs` e nada mais)
 *   3. empacota o lib/config-schema.ts e o lib/schema.ts reais, com um substituto para
 *      o fields/registry (que só arrasta componentes React de que não precisamos)
 *   4. corre o Zod contra o nosso .pages.yml
 *   5. imprime os rótulos que as 18 linhas do backoffice vão mostrar, com o interpolate
 *      verdadeiro — que é a única forma de saber se o `summary` está certo sem abrir o
 *      backoffice
 *
 * Precisa de rede e de npm. Não é preciso para publicar: o build já pára sozinho se o
 * .pages.yml e o data/vitrine.json se desalinharem. Isto é para quando se MEXE no
 * .pages.yml.
 *
 * Uso:  node _source/pipeline/7-pages-yml.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TMP = join(RAIZ, '_source/tmp')
const REPO = join(TMP, 'pages-cms')
const VAL = join(TMP, 'pages-cms-validador')
const REMOTO = 'https://github.com/pages-cms/pages-cms.git'

const corre = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

function passo (t) { console.log(`\n── ${t}`) }

// ── 1. o código do Pages CMS ────────────────────────────────────────────────────
passo('o código do Pages CMS')
mkdirSync(TMP, { recursive: true })
if (!existsSync(join(REPO, '.git'))) {
  console.log('   a clonar…')
  corre('git', ['clone', '--depth', '1', REMOTO, REPO])
} else {
  try { corre('git', ['fetch', '--depth', '1', 'origin'], REPO); corre('git', ['reset', '--hard', 'origin/HEAD'], REPO) }
  catch { console.log('   (sem rede — a usar o clone que já cá estava)') }
}
const sha = corre('git', ['rev-parse', '--short', 'HEAD'], REPO).trim()
const versao = corre('git', ['log', '-1', '--pretty=%s'], REPO).trim()
console.log(`   ${sha} · ${versao}`)

// ── 2. as três dependências, fora do repositório do site ────────────────────────
passo('as dependências do validador')
const zodVer = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).dependencies.zod
mkdirSync(VAL, { recursive: true })
if (!existsSync(join(VAL, 'package.json'))) writeFileSync(join(VAL, 'package.json'), '{"type":"module","private":true}\n')
if (!existsSync(join(VAL, 'node_modules/zod'))) {
  console.log(`   npm i zod@${zodVer} esbuild js-yaml slugify date-fns`)
  corre('npm', ['i', '--no-audit', '--no-fund', '--silent',
    `zod@${zodVer}`, 'esbuild', 'js-yaml', 'slugify', 'date-fns'], VAL)
}
console.log('   ok')

// ── 3. empacotar o esquema real ─────────────────────────────────────────────────
passo('empacotar o esquema')
// O fields/registry importa treze módulos que arrastam componentes React. Só nos
// interessa a lista de NOMES de tipos, e essa lê-se das chamadas a registerField.
const tipos = [...readFileSync(join(REPO, 'fields/registry.ts'), 'utf8')
  .matchAll(/registerField\(\s*["']([^"']+)["']/g)].map(m => m[1])
if (!tipos.length) { console.error('   ✗ não encontrei nenhum registerField() — o registry mudou de forma'); process.exit(1) }
console.log(`   ${tipos.length} tipos de campo: ${tipos.join(', ')}`)
writeFileSync(join(VAL, 'registry-substituto.ts'),
  `export const fieldTypes = new Set<string>(${JSON.stringify(tipos)})\n` +
  ['schemas', 'defaultValues', 'readFns', 'writeFns', 'labels', 'editComponents', 'viewComponents']
    .map(n => `export const ${n}: Record<string, any> = {}`).join('\n') + '\n')

const esbuild = await import(join(VAL, 'node_modules/esbuild/lib/main.js'))
const alias = {
  name: 'alias',
  setup (b) {
    b.onResolve({ filter: /^@\/fields\/registry$/ }, () => ({ path: join(VAL, 'registry-substituto.ts') }))
    b.onResolve({ filter: /^@\// }, a => ({ path: join(REPO, a.path.slice(2)), namespace: 'file' }))
  },
}
for (const [entrada, saida] of [['lib/config-schema.ts', 'config-schema.mjs'], ['lib/schema.ts', 'schema.mjs']]) {
  await esbuild.build({
    entryPoints: [join(REPO, entrada)], outfile: join(VAL, saida),
    bundle: true, format: 'esm', platform: 'node', logLevel: 'silent',
    external: ['zod', 'slugify', 'date-fns'], plugins: [alias],
  })
}
console.log('   ok')

// ── 4. validar ──────────────────────────────────────────────────────────────────
passo('validar o .pages.yml')
const require_ = (await import('node:module')).createRequire(join(VAL, 'x.mjs'))
const yaml = require_('js-yaml')
const { ConfigSchema } = await import(join(VAL, 'config-schema.mjs'))
const bruto = readFileSync(join(RAIZ, '.pages.yml'), 'utf8')
let doc
try { doc = yaml.load(bruto) } catch (e) { console.error('   ✗ YAML inválido:', e.message); process.exit(1) }
const r = ConfigSchema.safeParse(doc)
if (!r.success) {
  console.error('   ✗ o esquema do Pages CMS RECUSA o .pages.yml:')
  for (const i of r.error.issues) console.error(`     · ${i.path.join('.') || '(raiz)'} → ${i.message}`)
  process.exit(1)
}
console.log('   ✓ aceite, sem chaves a mais')

// ── 5. os rótulos que o backoffice vai mostrar ──────────────────────────────────
passo('os rótulos das linhas do backoffice')
const { interpolate } = await import(join(VAL, 'schema.mjs'))
let saiuMal = false
for (const entrada of doc.content ?? []) {
  for (const campo of entrada.fields ?? []) {
    const col = campo.list && typeof campo.list === 'object' ? campo.list.collapsible : null
    const resumo = col && typeof col === 'object' ? col.summary : null
    if (!resumo) continue
    const ficheiro = JSON.parse(readFileSync(join(RAIZ, entrada.path), 'utf8'))
    const lista = Array.isArray(ficheiro) ? ficheiro : ficheiro[campo.name]
    if (!Array.isArray(lista)) { console.error(`   ✗ ${entrada.path}: não tem uma lista em "${campo.name}"`); saiuMal = true; continue }
    console.log(`   ${entrada.path} · ${entrada.name}.${campo.name} · summary ${JSON.stringify(resumo)}`)
    // Um token mal escrito não dá erro em sítio nenhum: o interpolate devolve string
    // vazia. Com «{index}. {titulo}» as linhas ficam «1. », «2. » — que ainda parecem
    // ter conteúdo, e por isso a verificação tem de ser por TOKEN e não pela linha.
    const tokens = [...resumo.matchAll(/(?<!\\)\{([^}]+)\}/g)].map(m => m[1])
    for (const tok of tokens) {
      if (tok === 'index') continue
      const resolve = lista.filter(v => interpolate(`{${tok}}`, { index: '1', fields: v }, 'fields') !== '').length
      if (resolve === 0) {
        console.error(`     ✗ o token {${tok}} não existe nos dados — as ${lista.length} linhas ficam sem nome`)
        saiuMal = true
      } else if (resolve < lista.length) {
        console.error(`     ✗ o token {${tok}} só resolve em ${resolve} das ${lista.length} linhas`)
        saiuMal = true
      }
    }
    lista.forEach((v, i) => {
      const rot = interpolate(resumo, { index: `${i + 1}`, fields: v }, 'fields')
      const vazio = !rot.trim()
      if (vazio) saiuMal = true
      console.log(`     ${vazio ? '✗' : ' '} ${JSON.stringify(rot)}`)
    })
  }
}
// Uma entrada de content com `list: true` nunca chega ao summary: o Pages CMS fabrica
// um invólucro com `list: true` fixo no código e o rótulo fica «Item #N».
for (const entrada of doc.content ?? []) {
  if (entrada.list === true) {
    console.error(`   ✗ ${entrada.name}: tem \`list: true\` — as linhas vão dizer «Item #N»`)
    saiuMal = true
  }
}
console.log(saiuMal ? '\n✗ há rótulos vazios ou entradas com list: true' : '\n✓ tudo em ordem')
process.exit(saiuMal ? 1 : 0)
