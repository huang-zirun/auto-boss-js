/**
 * 将 userscript 文件内容复制到剪贴板，便于在脚本管理器中 Ctrl+V 更新
 * 使用：npm run copy  或在 IDE 里用任务/快捷键触发
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const scriptPath = path.join(__dirname, 'userscript.boss.recommend.user.js');
const content = fs.readFileSync(scriptPath, 'utf8');

const isWin = process.platform === 'win32';
if (isWin) {
  const tmp = path.join(__dirname, '.clipboard-tmp.txt');
  fs.writeFileSync(tmp, content, 'utf8');
  try {
    execSync(`powershell -NoProfile -Command "Get-Content -Path '${tmp.replace(/'/g, "''")}' -Raw -Encoding UTF8 | Set-Clipboard"`, {
      stdio: 'inherit',
      maxBuffer: 10 * 1024 * 1024,
    });
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
} else {
  try {
    execSync('pbcopy', { input: content, stdio: ['pipe', 'inherit', 'inherit'] });
  } catch {
    try {
      const { spawnSync } = require('child_process');
      spawnSync('xclip', ['-selection', 'clipboard'], { input: content, stdio: ['pipe', 'inherit', 'inherit'] });
    } catch {
      console.log('未检测到 pbcopy/xclip，请使用 npm run dev 从 URL 安装');
      process.exit(1);
    }
  }
}

console.log('已复制到剪贴板，到脚本管理器中 Ctrl+V 更新即可。');
