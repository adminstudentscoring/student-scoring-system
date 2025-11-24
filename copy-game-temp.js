const fs = require('fs');
const path = require('path');

const sourceFile = path.join(__dirname, 'public', 'game.js');
const destFile = path.join(__dirname, 'monster-fight', 'monster-fight.js');

try {
    fs.copyFileSync(sourceFile, destFile);
    console.log('File copied successfully');
} catch (error) {
    console.error('Error copying file:', error);
    process.exit(1);
}

