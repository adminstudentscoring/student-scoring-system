# Student Scoring System

A web-based student scoring system designed for Zoom classes with gamification features. This system allows teachers to track student participation, record answers, and display real-time leaderboards to encourage student engagement.

## Features

- ✅ Track student answer counts and scores
- ✅ Real-time updates via WebSocket
- ✅ Student leaderboard display
- ✅ Level and experience system
- ✅ Quick answer recording
- ✅ Data stored in TXT file (JSON format) for easy transfer
- ✅ Works across different computers by sharing the data file

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

```bash
npm start
```

The server will start on `http://localhost:3000`

### 3. Access the Application

- **Teacher Dashboard**: `http://localhost:3000`
- **Student View**: `http://localhost:3000/student.html`

## Usage

### Teacher Dashboard

1. **Add Students**: Enter student name and ID to add new students
2. **Record Answers**: Click "✓ Correct" or "✗ Incorrect" buttons to record answers
3. **Quick Recording**: Use the dropdown to quickly select and record answers
4. **Reset Scores**: Reset all student scores (use with caution)

### Student View

- Displays real-time leaderboard of top students
- Shows all students with their scores, levels, and answer counts
- Updates automatically when answers are recorded

## Data Storage

All data is stored in `data/students.txt` as a JSON file. This file can be:
- Easily backed up
- Transferred between computers
- Edited manually if needed
- Shared across different instances

To use on a different computer:
1. Copy the `data/students.txt` file
2. Place it in the `data/` folder on the new computer
3. Start the server

## Scoring System

- **Correct Answer**: +10 points, +10 experience
- **Incorrect Answer**: +2 points, +2 experience
- **Level Up**: Every 100 experience = 1 level

## Zoom Integration

Since this is a web application:
1. Share your screen in Zoom
2. Open the Student View (`student.html`) in a browser
3. Students will see the leaderboard in real-time
4. Use the Teacher Dashboard on your computer to record answers

## Technical Details

- **Backend**: Node.js + Express
- **Frontend**: Vanilla JavaScript + HTML/CSS
- **Real-time**: WebSocket (ws library)
- **Data Storage**: JSON file (students.txt)

## Future Enhancements

- Battle system between students
- Achievement badges
- Question categories
- Export/Import data features
- More gamification elements
