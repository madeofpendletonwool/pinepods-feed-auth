const express = require('express');
const { toXML } = require('jstoxml');
const MarkdownIt = require('markdown-it');
const fs = require('fs-extra');
const path = require('path');
const md = new MarkdownIt({
    html: true,
    breaks: true,  // Convert '\n' to <br>
    linkify: true, // Convert URLs to links
    typographer: true, // Enable smartquotes and other typographic replacements
});
const basicAuth = require('express-basic-auth');

const app = express();

// Middleware for basic auth
app.use(basicAuth({
    users: { 'test': 'test' },
    challenge: true,
    unauthorizedResponse: (req) => {
        return req.auth ? 'Credentials rejected' : 'No credentials provided'
    }
}));

// Serve static files from the root directory
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Explicitly serve the index.html at the root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

function parseFrontMatter(content) {
    const lines = content.split('\n');
    const frontMatter = {};
    let i = 0;

    if (lines[0].trim() === '---') {
        i++;
        while (i < lines.length && lines[i].trim() !== '---') {
            const line = lines[i];
            const [key, ...valueParts] = line.split(':').map(part => part.trim());
            // Join value parts back together in case the value contained colons
            frontMatter[key] = valueParts.join(':');
            i++;
        }
        i++;
    }
    return { frontMatter, body: lines.slice(i).join('\n') };
}

function wrapInCDATA(content) {
    return `<![CDATA[${content}]]>`;
}

function createFeed() {
    const items = [];
    const postFiles = fs.readdirSync(path.join(__dirname, 'posts'))
        .filter(file => path.extname(file) === '.md')
        .sort((a, b) => {
            // Sort by date in descending order
            const contentA = fs.readFileSync(path.join(__dirname, 'posts', a), 'utf8');
            const contentB = fs.readFileSync(path.join(__dirname, 'posts', b), 'utf8');
            const dateA = new Date(parseFrontMatter(contentA).frontMatter.date);
            const dateB = new Date(parseFrontMatter(contentB).frontMatter.date);
            return dateB - dateA;
        });

    postFiles.forEach(file => {
        const filePath = path.join(__dirname, 'posts', file);
        const content = fs.readFileSync(filePath, 'utf8');
        const { frontMatter, body } = parseFrontMatter(content);
        
        // Convert markdown to HTML with proper formatting
        const htmlContent = md.render(body);

        // Create item object
        const item = {
            item: {
                title: frontMatter.title || path.basename(file, '.md'),
                link: `http://news.pinepods.online/posts/${file}`,
                guid: {
                    _attrs: {
                        isPermaLink: "false"
                    },
                    _content: `http://news.pinepods.online/posts/${file}`
                },
                description: {
                    _cdata: htmlContent
                },
                "content:encoded": {
                    _cdata: htmlContent
                },
                author: "Collin Pendleton",
                pubDate: new Date(frontMatter.date || new Date()).toUTCString(),
                "itunes:explicit": "no",
                "itunes:author": "Collin Pendleton",
            }
        };

        // Add episode image if specified in frontmatter
        if (frontMatter.image) {
            item.item["itunes:image"] = {
                _attrs: {
                    href: frontMatter.image
                }
            };
        }

        items.push(item);
    });

    return {
        _name: 'rss',
        _attrs: {
            version: "2.0",
            "xmlns:atom": "http://www.w3.org/2005/Atom",
            "xmlns:content": "http://purl.org/rss/1.0/modules/content/",
            "xmlns:itunes": "http://www.itunes.com/dtds/podcast-1.0.dtd"
        },
        _content: {
            channel: {
                title: "Pinepods News Feed",
                description: {
                    _cdata: "This feed is a news feed for Pinepods. I release articles detailing every new release."
                },
                link: "https://news.pinepods.online",
                language: "en-US",
                "atom:link": {
                    _attrs: {
                        href: "https://news.pinepods.online/feed.xml",
                        rel: "self",
                        type: "application/rss+xml"
                    }
                },
                "itunes:author": "Collin Pendleton",
                "itunes:explicit": "no",
                "itunes:image": {
                    _attrs: {
                        href: "https://news.pinepods.online/assets/pinepods-logo.jpeg"
                    }
                },
                "itunes:category": [
                    { _attrs: { text: "Technology" } },
                    { _attrs: { text: "Tech News" } }
                ],
                _content: items
            }
        }
    };
}

app.get('/feed.xml', (req, res) => {
    const feed = createFeed();
    const xmlOptions = {
        header: true,
        indent: '  '
    };
    res.type('application/xml');
    res.send(toXML(feed, xmlOptions));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));