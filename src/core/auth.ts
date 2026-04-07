import type { FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';

const PASSWORD = process.env.API_KEY || '';
const TOKEN_COOKIE = 'md2wechat_token';

function generateToken(password: string): string {
  return createHash('sha256').update(`md2wechat:${password}`).digest('hex');
}

const validToken = PASSWORD ? generateToken(PASSWORD) : '';

export function isAuthEnabled(): boolean {
  return !!PASSWORD;
}

export function checkAuth(req: FastifyRequest): boolean {
  if (!PASSWORD) return true;
  const cookies = parseCookies(req.headers.cookie || '');
  return cookies[TOKEN_COOKIE] === validToken;
}

export function verifyPassword(password: string): boolean {
  return password === PASSWORD;
}

export function getTokenCookie(): string {
  return `${TOKEN_COOKIE}=${validToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`;
}

export function getClearCookie(): string {
  return `${TOKEN_COOKIE}=; Path=/; HttpOnly; Max-Age=0`;
}

export function getLoginPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>md2wechat 登录</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;background:#f7f8fa;color:#1a1a1a;display:flex;align-items:center;justify-content:center;height:100vh}
.box{background:#fff;border:1px solid #e8e8e8;border-radius:16px;padding:48px;width:360px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.08)}
h1{font-size:24px;margin-bottom:4px;color:#07c160}
p{font-size:13px;color:#999;margin-bottom:32px}
input{width:100%;padding:12px 16px;border-radius:8px;border:1px solid #e8e8e8;background:#fafafa;color:#1a1a1a;font-size:14px;margin-bottom:16px;outline:none;transition:border-color 0.2s}
input:focus{border-color:#07c160}
button{width:100%;padding:12px;border-radius:8px;border:none;background:#07c160;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:background 0.2s}
button:hover{background:#06ad56}
.error{color:#e53935;font-size:13px;margin-bottom:12px;display:none}
</style></head>
<body>
<div class="box">
  <h1>md2wechat</h1>
  <p>请输入访问密码</p>
  <div class="error" id="err"></div>
  <input type="password" id="pwd" placeholder="密码" autofocus onkeydown="if(event.key==='Enter')login()"/>
  <button onclick="login()">登录</button>
</div>
<script>
async function login(){
  const pwd=document.getElementById('pwd').value;
  const err=document.getElementById('err');
  err.style.display='none';
  const res=await fetch('/api/console-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pwd})});
  const data=await res.json();
  if(data.ok){location.reload();}
  else{err.textContent=data.error||'登录失败';err.style.display='block';}
}
</script>
</body></html>`;
}

function parseCookies(cookieStr: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieStr.split(';').forEach((pair) => {
    const [key, ...val] = pair.trim().split('=');
    if (key) cookies[key] = val.join('=');
  });
  return cookies;
}
