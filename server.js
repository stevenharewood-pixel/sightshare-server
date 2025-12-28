// server.js - Backend API for SightShare
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize SQLite Database
const db = new sqlite3.Database('./sightshare.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initDatabase();
  }
});

// Create tables
function initDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      gallery_name TEXT NOT NULL,
      gallery_id TEXT NOT NULL,
      visit_date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      gallery_name TEXT NOT NULL,
      gallery_id TEXT NOT NULL,
      photo_count INTEGER NOT NULL,
      photos TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Database tables initialized');
}

// ============================================
// API ENDPOINTS
// ============================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Submit guest info (when they enter gallery)
app.post('/api/guests', (req, res) => {
  const { name, email, galleryName, galleryId, visitDate } = req.body;

  if (!name || !email || !galleryName || !galleryId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const sql = `INSERT INTO guests (name, email, gallery_name, gallery_id, visit_date) 
               VALUES (?, ?, ?, ?, ?)`;
  
  db.run(sql, [name, email, galleryName, galleryId, visitDate || new Date().toISOString()], function(err) {
    if (err) {
      console.error('Error inserting guest:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    res.json({ 
      success: true, 
      id: this.lastID,
      message: 'Guest info saved successfully' 
    });
  });
});

// Submit order (favorite photos)
app.post('/api/orders', (req, res) => {
  const { name, email, galleryName, galleryId, photos, submittedAt } = req.body;

  if (!name || !email || !galleryName || !galleryId || !photos) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const photoCount = photos.length;
  const photosJson = JSON.stringify(photos);

  const sql = `INSERT INTO orders (name, email, gallery_name, gallery_id, photo_count, photos, submitted_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`;
  
  db.run(sql, [name, email, galleryName, galleryId, photoCount, photosJson, submittedAt || new Date().toISOString()], function(err) {
    if (err) {
      console.error('Error inserting order:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    res.json({ 
      success: true, 
      id: this.lastID,
      message: 'Order submitted successfully' 
    });
  });
});

// Get all guests (for admin dashboard & Electron app)
app.get('/api/guests', (req, res) => {
  const sql = `SELECT * FROM guests ORDER BY created_at DESC`;
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('Error fetching guests:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ success: true, guests: rows });
  });
});

// Get all orders (for admin dashboard & Electron app)
app.get('/api/orders', (req, res) => {
  const sql = `SELECT * FROM orders ORDER BY created_at DESC`;
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('Error fetching orders:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    // Parse photos JSON for each order
    const orders = rows.map(order => ({
      ...order,
      photos: JSON.parse(order.photos)
    }));
    
    res.json({ success: true, orders });
  });
});

// Get orders by gallery ID
app.get('/api/orders/:galleryId', (req, res) => {
  const { galleryId } = req.params;
  const sql = `SELECT * FROM orders WHERE gallery_id = ? ORDER BY created_at DESC`;
  
  db.all(sql, [galleryId], (err, rows) => {
    if (err) {
      console.error('Error fetching orders:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    const orders = rows.map(order => ({
      ...order,
      photos: JSON.parse(order.photos)
    }));
    
    res.json({ success: true, orders });
  });
});

// Delete guest
app.delete('/api/guests/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM guests WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Error deleting guest:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ success: true, message: 'Guest deleted' });
  });
});

// Delete order
app.delete('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM orders WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Error deleting order:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ success: true, message: 'Order deleted' });
  });
});

// Clear all guests
app.delete('/api/guests', (req, res) => {
  db.run('DELETE FROM guests', [], function(err) {
    if (err) {
      console.error('Error clearing guests:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ success: true, message: 'All guests cleared', deleted: this.changes });
  });
});

// Clear all orders
app.delete('/api/orders', (req, res) => {
  db.run('DELETE FROM orders', [], function(err) {
    if (err) {
      console.error('Error clearing orders:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ success: true, message: 'All orders cleared', deleted: this.changes });
  });
});

// Export data as CSV
app.get('/api/export/guests', (req, res) => {
  db.all('SELECT * FROM guests ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    const csv = [
      'ID,Name,Email,Gallery Name,Gallery ID,Visit Date,Created At',
      ...rows.map(r => `${r.id},"${r.name}","${r.email}","${r.gallery_name}","${r.gallery_id}","${r.visit_date}","${r.created_at}"`)
    ].join('\n');
    
    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', 'attachment; filename=guests.csv');
    res.send(csv);
  });
});

app.get('/api/export/orders', (req, res) => {
  db.all('SELECT * FROM orders ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    const csv = [
      'ID,Name,Email,Gallery Name,Gallery ID,Photo Count,Submitted At,Created At',
      ...rows.map(r => `${r.id},"${r.name}","${r.email}","${r.gallery_name}","${r.gallery_id}",${r.photo_count},"${r.submitted_at}","${r.created_at}"`)
    ].join('\n');
    
    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', 'attachment; filename=orders.csv');
    res.send(csv);
  });
});

// Statistics endpoint
app.get('/api/stats', (req, res) => {
  const stats = {};
  
  db.get('SELECT COUNT(*) as count FROM guests', [], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    stats.totalGuests = row.count;
    
    db.get('SELECT COUNT(*) as count FROM orders', [], (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      stats.totalOrders = row.count;
      
      db.get('SELECT SUM(photo_count) as count FROM orders', [], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        stats.totalPhotosOrdered = row.count || 0;
        
        res.json({ success: true, stats });
      });
    });
  });
});

// Serve admin dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`SightShare API Server running on port ${PORT}`);
  console.log(`Admin Dashboard: http://localhost:${PORT}`);
  console.log(`API Endpoints: http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed');
    }
    process.exit(0);
  });
});
