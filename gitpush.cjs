const {execSync} = require('child_process');
const cwd = 'c:\\Users\\bengo\\Documents\\Walrus Session 4';
const run = (cmd) => {
  try {
    const out = execSync(cmd, { cwd, shell: 'cmd.exe', encoding: 'utf8', stdio: 'pipe' });
    return out || '(ok)';
  } catch(e) {
    return (e.stdout || '') + (e.stderr || '') || e.message;
  }
};

console.log('=== git init ===');
console.log(run('git init'));

console.log('=== git config ===');
console.log(run('git config user.email "walruzezzion4@walrus.xyz"'));
console.log(run('git config user.name "Walruzezzion4"'));

console.log('=== git add ===');
console.log(run('git add .'));

console.log('=== git commit ===');
console.log(run('git commit -m "feat: Walruzezzion4 - World Cup 2026 AI War Room with Walrus Memory"'));

console.log('=== git remote ===');
console.log(run('git remote add origin https://github.com/zazadra/walruzezzion4.git'));

console.log('=== git branch ===');
console.log(run('git branch -M main'));

console.log('=== git push ===');
console.log(run('git push -u origin main'));

console.log('=== DONE ===');
