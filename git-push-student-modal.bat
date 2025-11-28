@echo off
echo Adding files...
git add server.js
git add public/student-details-modal.js
git add public/organization.html
git add public/admin-organization-tools.js
git add public/admin.html

echo Committing changes...
git commit -m "Add student details modal with 13 fields for Organization and Admin pages"

echo Pushing to remote...
git push origin main

echo Done!

