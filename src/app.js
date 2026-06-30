const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const apiRoutes = require('./routes');
const config = require('./config/env');

const app = express();

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",          
                "https://unpkg.com",         
                "https://cdn.jsdelivr.net"   
            ],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",          
                "https://unpkg.com",         
                "https://fonts.googleapis.com"
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com"
            ],
            imgSrc: [
                "'self'",
                "data:",                    
                "https://a.tile.openstreetmap.org",
                "https://b.tile.openstreetmap.org",
                "https://c.tile.openstreetmap.org"
            ],
            connectSrc: [
                "'self'",
                "ws:",                      
                "wss:",                     
                "https://a.tile.openstreetmap.org",
                "https://b.tile.openstreetmap.org",
                "https://c.tile.openstreetmap.org"
            ],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"]
        }
    }
}));

app.use(cors({ origin: process.env.NODE_ENV === 'production' ? ['https://simprech-jabar.my.id', 'https://akmaludien.github.io'] : '*' }));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 100, message: 'Too many requests' });
app.use('/api/', limiter);

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', apiRoutes);

app.get('*', (req, res) => {
    const filePath = path.join(__dirname, '..', 'public', req.path);
    if (fs.existsSync(filePath + '.html')) {
        return res.sendFile(filePath + '.html');
    }
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

module.exports = app;
