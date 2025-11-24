# How to Use the Student Scoring System

## 🎉 New: Desktop App with Always-On-Top Floating Window!

You can now use the application as a desktop app that stays on top of all windows!

### Quick Start (Desktop App - Recommended):

```bash
npm install
npm run app
```

The window will automatically stay on top and you can use it during Zoom classes!

---

## ⚠️ Web Browser Mode: Starting the Server

**If using web browser, you MUST start the Node.js server before using the application!**

### Steps:

1. **Open Terminal/Command Prompt** in the project folder
2. **Install dependencies** (if not done yet):
   ```bash
   npm install
   ```

3. **Start the server**:
   ```bash
   npm start
   ```

4. **Wait for the message**:
   ```
   Server running on http://localhost:3000
   ```

5. **Open your browser** and go to:
   - Teacher Dashboard: `http://localhost:3000`
   - Student View: `http://localhost:3000/student.html`

## ❌ Common Mistakes

### Don't use Live Server or VS Code's "Open with Live Server"
- These tools open files on port 5500
- They cannot run the Node.js backend API
- You will get 404 errors when trying to add students

### Don't double-click the HTML file
- This opens the file directly without the server
- API requests will fail

## ✅ Correct Ways

### Desktop App (Recommended):
1. Run `npm run app` or `npm run electron`
2. The app automatically starts the server and opens a floating window
3. Window stays on top of all other applications
4. Perfect for Zoom classes!

### Web Browser:
1. Always start the server first with `npm start`
2. Then open `http://localhost:3000` in your browser
3. Keep the terminal window open while using the application

## 🔧 Troubleshooting

### If you see "404 Not Found" or "405 Method Not Allowed":
- Make sure the server is running (check terminal)
- Make sure you're accessing `http://localhost:3000` (not port 5500)
- Try restarting the server: Press `Ctrl+C` in terminal, then run `npm start` again

### If port 3000 is already in use:
- Close other applications using port 3000
- Or change the PORT in `server.js` to a different number (e.g., 3001)
