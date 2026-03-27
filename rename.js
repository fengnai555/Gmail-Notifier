const fs = require('fs');
const files = [
  'package.json',
  'electron-builder.yml',
  'main.js',
  'index.html',
  'test-email.js',
  'README.md',
  'website/index.html',
  'website/privacy.html',
  'website/terms.html'
];
for (const file of files) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Config names
    if (file === 'package.json' || file === 'electron-builder.yml' || file === 'README.md') {
      content = content.replace(/"gmail-notifier"/g, '"otp-notifier"');
      content = content.replace(/gmail-notifier Setup/g, 'otp-notifier Setup');
      content = content.replace(/gmail-notifier X\.X\.X/g, 'otp-notifier X.X.X');
    }
    
    // Display names
    content = content.replace(/Gmail Notifier/g, 'Desktop OTP Notifier');
    
    fs.writeFileSync(file, content);
  }
}
