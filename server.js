const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const cors = require('cors');

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/websocketDB', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));

// Define a simple model
const Orders = mongoose.model('Orders', new mongoose.Schema({
  content: String,
  status: { type: String, default: 'pending' },
  timestamp: { type: Date, default: Date.now }
}));

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors()); // Use the cors middleware
app.use(express.json()); // Middleware to parse JSON

// Handle WebSocket connections
wss.on('connection', async ws => {
  console.log('Client connected');

  try {
    // Send all previous orders to the newly connected client
    const orders = await Orders.find().sort({ timestamp: 1 });
    ws.send(JSON.stringify({ type: 'initial', data: orders }));
  } catch (err) {
    console.error(err);
  }

  ws.on('message', async orderContent => {
    console.log(`Received order => ${orderContent}`);

    // Save the order to MongoDB
    try {
      const order = new Orders({ content: orderContent });
      await order.save();

      // Broadcast the new order to all clients
      const newOrder = { type: 'newOrder', data: order };
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(newOrder));
        }
      });
    } catch (err) {
      console.error(err);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Route to handle creating and showing all orders
app.route('/')
  .get(async (req, res) => {
    try {
      const orders = await Orders.find().sort({ timestamp: 1 });
      res.status(200).json(orders);
    } catch (err) {
      console.error(err);
      res.status(500).send({ message: 'Internal server error' });
    }
  })
  .post(async (req, res) => {
    try {
      const order = new Orders({ content: req.body.content });
      await order.save();
      res.status(201).json(order);

      // Broadcast the new order to all clients
      const newOrder = { type: 'newOrder', data: order };
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(newOrder));
        }
      });
    } catch (err) {
      console.error(err);
      res.status(500).send({ message: 'Internal server error' });
    }
  });

// Route to handle showing pending orders and updating status
app.route('/operations')
  .get(async (req, res) => {
    try {
      const orders = await Orders.find({ status: 'pending' }).sort({ timestamp: 1 });
      res.status(200).json(orders);
    } catch (err) {
      console.error(err);
      res.status(500).send({ message: 'Internal server error' });
    }
  });

app.put('/operations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const order = await Orders.findByIdAndUpdate(id, { status }, { new: true });

    if (order) {
      // Broadcast the updated order to all clients
      const updatedOrder = { type: 'updateOrder', data: order };
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(updatedOrder));
        }
      });
      res.status(200).send(order);
    } else {
      res.status(404).send({ message: 'Order not found' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: 'Internal server error' });
  }
});

server.listen(3001, () => {
  console.log('Server is listening on port 3001');
});