// Migration Script: Migrate all data to 'owner' userId
// Run this on your live server: node migrate-to-owner.js

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './data/database.sqlite';
const db = new Database(DB_PATH);

console.log('🔄 Starting migration to owner userId...\n');

// Get all unique userIds from each table
const tables = ['groups', 'autoreplies', 'templates', 'schedules', 'commands', 'settings', 'crm_contacts', 'crm_sequences'];

tables.forEach(table => {
    try {
        const rows = db.prepare(`SELECT DISTINCT userId FROM ${table} WHERE userId != 'owner'`).all();
        if (rows.length > 0) {
            const oldUserIds = rows.map(r => r.userId);
            console.log(`📋 ${table}: Found data for userIds: ${oldUserIds.join(', ')}`);
            
            // Migrate all to 'owner'
            const result = db.prepare(`UPDATE ${table} SET userId = 'owner' WHERE userId != 'owner'`).run();
            console.log(`   ✅ Migrated ${result.changes} rows to 'owner'\n`);
        } else {
            console.log(`📋 ${table}: No migration needed`);
        }
    } catch (e) {
        console.log(`⚠️  ${table}: Table might not exist or error - ${e.message}`);
    }
});

// Migrate WhatsApp session folder
const authDir = path.join(__dirname, '.wwebjs_auth');
if (fs.existsSync(authDir)) {
    const sessions = fs.readdirSync(authDir).filter(f => f.startsWith('session-') && f !== 'session-owner');
    
    if (sessions.length > 0) {
        console.log('\n📱 WhatsApp Sessions found:');
        sessions.forEach(session => {
            const oldPath = path.join(authDir, session);
            const newPath = path.join(authDir, 'session-owner');
            
            if (!fs.existsSync(newPath)) {
                fs.renameSync(oldPath, newPath);
                console.log(`   ✅ Renamed ${session} -> session-owner`);
            } else {
                console.log(`   ⚠️  session-owner already exists, skipping ${session}`);
            }
        });
    } else {
        console.log('\n📱 No session folders to migrate');
    }
} else {
    console.log('\n📱 No .wwebjs_auth folder found');
}

console.log('\n✅ Migration complete! Restart your server.');
db.close();
