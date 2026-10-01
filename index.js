 const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

const pathToFile = path.join(__dirname, 'db.json');
const cache = {};
const TTL = 60 * 1000;

async function readFile() {
    try {
        const data = await fs.promises.readFile(pathToFile, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.log(err);
        return [];
    }
}

async function readFileWithDelay() {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return await readFile();
}

async function writeFile(data) {
    await fs.promises.writeFile(pathToFile, JSON.stringify(data, null, 2), 'utf-8');
}

const db = {
    async getAll() {
        return await readFileWithDelay();
    },
    async getById(id) {
        const products = await readFileWithDelay();
        return products.find((item) => item.id === Number(id));
    },
    async create(productData) {
        const products = await readFile();
        const newId = products.length ? Math.max(...products.map((p) => p.id)) + 1 : 1;
        const newProduct = { ...productData, id: productData.id !== undefined ? Number(productData.id) : newId };
        products.push(newProduct);
        await writeFile(products);
        return newProduct;
    },
    async update(id, productData) {
        const products = await readFile();
        const index = products.findIndex((item) => item.id === Number(id));
        if (index === -1) return null;
        products[index] = { ...productData, id: Number(id) };
        await writeFile(products);
        return products[index];
    },
    async patch(id, productData) {
        const products = await readFile();
        const index = products.findIndex((item) => item.id === Number(id));
        if (index === -1) return null;
        products[index] = { ...products[index], ...productData, id: Number(id) };
        await writeFile(products);
        return products[index];
    },
    async remove(id) {
        const products = await readFile();
        const index = products.findIndex((item) => item.id === Number(id));
        if (index === -1) return null;
        const deleted = products.splice(index, 1)[0];
        await writeFile(products);
        return deleted;
    }
};

const service = {
    async getAll() {
        return await db.getAll();
    },
    async getById(id) {
        return await db.getById(id);
    },
    async create(data) {
        return await db.create(data);
    },
    async update(id, data) {
        return await db.update(id, data);
    },
    async patch(id, data) {
        return await db.patch(id, data);
    },
    async remove(id) {
        return await db.remove(id);
    }
};

function clearCache() {
    for (const key in cache) {
        delete cache[key];
    }
}

function cacheMiddleware(req, res, next) {
    const key = req.originalUrl || req.url;
    const cached = cache[key];

    if (cached) {
        if (Date.now() - cached.createdAt < TTL) {
            res.setHeader('X-Cache', 'HIT');
            return res.json(cached.data);
        }
        delete cache[key];
    }

    res.setHeader('X-Cache', 'MISS');

    const originalJson = res.json.bind(res);
    res.json = (data) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            cache[key] = { data, createdAt: Date.now() };
        }
        return originalJson(data);
    };

    next();
}

const controller = {
    async getAll(req, res) {
        try {
            const products = await service.getAll();
            res.json(products);
        } catch (err) {
            console.log(err);
            res.status(500).json({ error: err.message });
        }
    },
    async getById(req, res) {
        try {
            const product = await service.getById(req.params.id);
            if (!product) return res.status(404).json({ message: 'Product not found' });
            res.json(product);
        } catch (err) {
            console.log(err);
            res.status(500).json({ error: err.message });
        }
    },
    async create(req, res) {
        try {
            const product = await service.create(req.body);
            clearCache();
            res.status(201).json(product);
        } catch (err) {
            console.log(err);
            res.status(500).json({ error: err.message });
        }
    },
    async update(req, res) {
        try {
            const product = await service.update(req.params.id, req.body);
            if (!product) return res.status(404).json({ message: 'Product not found' });
            clearCache();
            res.json(product);
        } catch (err) {
            console.log(err);
            res.status(500).json({ error: err.message });
        }
    },
    async patch(req, res) {
        try {
            const product = await service.patch(req.params.id, req.body);
            if (!product) return res.status(404).json({ message: 'Product not found' });
            clearCache();
            res.json(product);
        } catch (err) {
            console.log(err);
            res.status(500).json({ error: err.message });
        }
    },
    async remove(req, res) {
        try {
            const product = await service.remove(req.params.id);
            if (!product) return res.status(404).json({ message: 'Product not found' });
            clearCache();
            res.json(product);
        } catch (err) {
            console.log(err);
            res.status(500).json({ error: err.message });
        }
    }
};

app.use(express.json());

app.get('/products', cacheMiddleware, controller.getAll);
app.get('/products/:id', cacheMiddleware, controller.getById);
app.post('/products', controller.create);
app.put('/products/:id', controller.update);
app.patch('/products/:id', controller.patch);
app.delete('/products/:id', controller.remove);

app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});

module.exports = app;