@echo off
echo Adding files...
git add server.js
git add public/organization.html
git add public/admin-organization-tools.js
git add public/admin.html

echo Committing changes...
git commit -m "Remove student-details-modal.js references from batch file"

echo Pushing to remote...
git push origin main

echo Done!

