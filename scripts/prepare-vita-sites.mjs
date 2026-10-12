import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const sites=JSON.parse(fs.readFileSync('sites/deploy-manifest.json','utf8'));
const names=['agro','tech','fresh','stores','trad','logi'];
if(sites.length!==names.length || new Set(sites.map(s=>s.name)).size!==names.length) throw Error('Expected six distinct Vita sites');
const commonHtaccess=fs.readFileSync('sites/vita-fresh/.htaccess','utf8');
fs.mkdirSync('site-sources',{recursive:true});
fs.mkdirSync('site-bundle',{recursive:true});
for(const site of sites){
  if(!names.includes(site.name) || site.repository!==`Vitagro/vita-${site.name}-site` || !/^[a-f0-9]{40}$/.test(site.revision)) throw Error('Invalid source manifest');
  const src=path.join('site-sources',site.name),dst=path.join('site-bundle',site.name);
  fs.mkdirSync(src);fs.mkdirSync(dst);
  execFileSync('git',['init','--quiet',src]);
  execFileSync('git',['-C',src,'fetch','--quiet','--depth','1',`https://github.com/${site.repository}.git`,site.revision]);
  execFileSync('git',['-C',src,'checkout','--quiet','--detach','FETCH_HEAD']);
  if(path.basename(site.html)!==site.html || !site.html.endsWith('.html'))throw Error('Invalid entry point');
  const html=fs.readFileSync(path.join(src,site.html),'utf8');
  if(!/<title>Vita /i.test(html))throw Error(`Invalid title: ${site.name}`);
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    if(!/src=|application\/ld\+json/i.test(m[1]))new vm.Script(m[2]);
  }
  fs.writeFileSync(path.join(dst,'index.html'),html);
  const htaccess=fs.existsSync(path.join(src,'.htaccess'))?fs.readFileSync(path.join(src,'.htaccess'),'utf8'):commonHtaccess;
  fs.writeFileSync(path.join(dst,'.htaccess'),htaccess);
  fs.writeFileSync(path.join(dst,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: https://${site.domain}/sitemap.xml\n`);
  fs.writeFileSync(path.join(dst,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://${site.domain}/</loc></url></urlset>\n`);
  console.log(`${site.repository}@${site.revision}: validated`);
}
