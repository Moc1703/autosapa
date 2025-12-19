// Migration Script v2: Migrate all data to 'owner' userId
// Run this on your live server: node migrate-to-owner.js

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './data/database.sqlite';
const DATA_DIR = process.env.DATA_DIR || './data';

console.log('🔄 Starting migration to owner userId...\n');

// Step 1: Migrate JSON folders (user data files)
console.log('📁 Step 1: Migrating user JSON data folders...');
const dataDir = path.resolve(DATA_DIR);

if (fs.existsSync(dataDir)) {
    const folders = fs.readdirSync(dataDir).filter(f => {
        const folderPath = path.join(dataDir, f);
        return fs.statSync(folderPath).isDirectory() && 
               f !== 'owner' && 
               f !== 'uploads' &&
               !f.startsWith('.');
    });

    if (folders.length > 0) {
        console.log(`   Found user folders: ${folders.join(', ')}`);
        
        const ownerDir = path.join(dataDir, 'owner');
        if (!fs.existsSync(ownerDir)) {
            fs.mkdirSync(ownerDir, { recursive: true });
        }

        // Copy files from first found user folder to owner
        const sourceFolder = path.join(dataDir, folders[0]);
        const files = fs.readdirSync(sourceFolder);
        
        files.forEach(file => {
            const srcPath = path.join(sourceFolder, file);
            const destPath = path.join(ownerDir, file);
            
            if (!fs.existsSync(destPath)) {
                fs.copyFileSync(srcPath, destPath);
                console.log(`   ✅ Copied ${file} to owner folder`);
            } else {
                console.log(`   ⚠️  ${file} already exists in owner folder, skipping`);
            }
        });
    } else {
        console.log('   No user folders to migrate');
    }
} else {
    console.log('   ⚠️  Data directory not found');
}

// Step 2: Migrate database tables (CRM)
console.log('\n📊 Step 2: Migrating database tables...');
try {
    const db = new Database(DB_PATH);
    
    // CRM contacts
    try {
        const contacts = db.prepare(`SELECT DISTINCT userId FROM crm_contacts WHERE userId != 'owner'`).all();
        if (contacts.length > 0) {
            console.log(`   crm_contacts: Found ${contacts.length} old userId(s)`);
            const result = db.prepare(`UPDATE crm_contacts SET userId = 'owner' WHERE userId != 'owner'`).run();
            console.log(`   ✅ Migrated ${result.changes} contacts to 'owner'`);
        } else {
            console.log('   crm_contacts: No migration needed');
        }
    } catch (e) {
        console.log(`   ⚠️  crm_contacts: ${e.message}`);
    }

    // CRM sequences
    try {
        const sequences = db.prepare(`SELECT DISTINCT userId FROM crm_sequences WHERE userId != 'owner'`).all();
        if (sequences.length > 0) {
            console.log(`   crm_sequences: Found ${sequences.length} old userId(s)`);
            const result = db.prepare(`UPDATE crm_sequences SET userId = 'owner' WHERE userId != 'owner'`).run();
            console.log(`   ✅ Migrated ${result.changes} sequences to 'owner'`);
        } else {
            console.log('   crm_sequences: No migration needed');
        }
    } catch (e) {
        console.log(`   ⚠️  crm_sequences: ${e.message}`);
    }

    db.close();
} catch (e) {
    console.log(`   ❌ Database error: ${e.message}`);
}

// Step 3: Migrate WhatsApp session folder
console.log('\n📱 Step 3: Migrating WhatsApp session...');
const authDir = path.resolve('.wwebjs_auth');
if (fs.existsSync(authDir)) {
    const sessions = fs.readdirSync(authDir).filter(f => f.startsWith('session-') && f !== 'session-owner');
    
    if (sessions.length > 0) {
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
        console.log('   No session folders to migrate');
    }
} else {
    console.log('   No .wwebjs_auth folder found');
}

console.log('\n✅ Migration complete! Restart your server: pm2 restart all');
