@echo off
echo Adding files...
git add public/teacher-details-modal.js
git add public/organization.html
git add public/admin.html
git add public/admin-organization-tools.js
git add server.js

echo Committing changes...
git commit -m "Remove student-details-modal.js and all related references - Delete student-details-modal.js file completely - Remove script tag from organization.html and admin.html - Remove openStudentDetailsModal function calls from organization.html and admin-organization-tools.js - Clean up teacher-details-modal.js comments about avoiding conflicts - Update batch files to remove student-details-modal.js references - Disable student card click functionality"

echo Pushing to remote...
git push origin main

echo Done!

