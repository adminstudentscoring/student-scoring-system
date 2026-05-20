// Organization billing + finance routes extracted from server.js to keep the entry file manageable.
// All route behavior should remain identical.


function registerOrgFinanceRoutes(app: any, deps: any): void {
  const {
    authenticateUser,
    authorizeRole,
    readUsers,
    readData,
    writeData,
    readTransactions,
    writeTransactions,
    readExpenses,
    writeExpenses
  } = deps;

  app.post('/api/organizations/students/:id/balance', authenticateUser, authorizeRole('organization', 'teacher'), async (req, res) => {
    try {
      const { id } = req.params;
      const { amount, type, note } = req.body;

      if (!amount || !type || !['credit', 'debit'].includes(type)) {
        return res.status(400).json({ error: 'Invalid data' });
      }

      const data = await readData();
      const studentIndex = data.students.findIndex(s => s.id === id);
      if (studentIndex === -1) return res.status(404).json({ error: 'Student not found' });

      const student = data.students[studentIndex];
      const orgId = req.user.organizationId;

      if (student.organizationId !== orgId) return res.status(403).json({ error: 'Access denied' });

      const value = parseFloat(amount);
      if (isNaN(value)) return res.status(400).json({ error: 'Invalid amount' });

      const oldBalance = student.balance || 0;
      if (type === 'credit') {
        student.balance = oldBalance + value;
      } else {
        student.balance = oldBalance - value;
      }

      const transactions = await readTransactions();
      const transaction = {
        id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        organizationId: orgId,
        studentId: id,
        type,
        amount: value,
        balanceBefore: oldBalance,
        balanceAfter: student.balance,
        note: note || '',
        createdAt: new Date().toISOString(),
        createdBy: req.user.id
      };
      transactions.push(transaction);

      await writeData(data);
      await writeTransactions(transactions);

      res.json({ success: true, balance: student.balance, transaction });
    } catch (error) {
      console.error('Error adjusting balance:', error);
      res.status(500).json({ error: 'Failed to adjust balance' });
    }
  });

  // Get Transactions
  app.get('/api/organizations/transactions', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { studentId } = req.query;
      const transactions = await readTransactions();
      const orgId = req.user.organizationId;

      let filtered = transactions.filter(t => t.organizationId === orgId);
      if (studentId) {
        filtered = filtered.filter(t => t.studentId === studentId);
      }

      res.json(filtered);
    } catch (error) {
      console.error('Error getting transactions:', error);
      res.status(500).json({ error: 'Failed to get transactions' });
    }
  });


  app.get('/api/organizations/expenses', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const expenses = await readExpenses();
      const orgExpenses = expenses.filter(e => e.organizationId === req.user.organizationId);
      res.json(orgExpenses);
    } catch (error) {
      console.error('Error getting expenses:', error);
      res.status(500).json({ error: 'Failed to get expenses' });
    }
  });

  // Add Expense
  app.post('/api/organizations/expenses', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { item, amount, date, category, note } = req.body;

      if (!item || !amount || !date || !category) {
        return res.status(400).json({ error: 'Required fields missing' });
      }

      const expenses = await readExpenses();
      const newExpense = {
        id: `exp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        organizationId: req.user.organizationId,
        item,
        amount: parseFloat(amount),
        date,
        category,
        note: note || '',
        createdAt: new Date().toISOString(),
        createdBy: req.user.id
      };

      expenses.push(newExpense);
      await writeExpenses(expenses);

      res.json(newExpense);
    } catch (error) {
      console.error('Error adding expense:', error);
      res.status(500).json({ error: 'Failed to add expense' });
    }
  });

  // Delete Expense
  app.delete('/api/organizations/expenses/:id', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { id } = req.params;
      const expenses = await readExpenses();
      const index = expenses.findIndex(e => e.id === id);

      if (index === -1) return res.status(404).json({ error: 'Expense not found' });
      if (expenses[index].organizationId !== req.user.organizationId) return res.status(403).json({ error: 'Access denied' });

      expenses.splice(index, 1);
      await writeExpenses(expenses);

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting expense:', error);
      res.status(500).json({ error: 'Failed to delete expense' });
    }
  });
}

module.exports = { registerOrgFinanceRoutes };
export {};
