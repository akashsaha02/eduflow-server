
      // Menu Collection
      app.get('/menu', async (req, res) => {
        const menu = await menuCollection.find().toArray();
        res.send(menu);
      });
  
      app.get('/menu/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const menuItem = await menuCollection.findOne(query);
        res.send(menuItem);
      });
  
      app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
        const menuItem = req.body;
        const result = await menuCollection.insertOne(menuItem);
        res.json(result);
      });
  
      app.patch('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
        const id = req.params.id;
        const menuItem = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: menuItem,
        };
        const result = await menuCollection.updateOne(query, updateDoc);
        res.json(result);
      });
  
      app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await menuCollection.deleteOne(query);
        res.json(result);
      });
  
  
      // Review Collection
      app.get('/reviews', async (req, res) => {
        const reviews = await reviewsCollection.find().toArray();
        res.send(reviews);
      });
  
  
      // Carts Collection
      app.get('/carts', verifyToken, async (req, res) => {
        const email = req.query.email;
        const query = { email: email };
        const result = await cartsCollection.find(query).toArray();
        res.send(result);
      });
  
      app.post('/carts', verifyToken, async (req, res) => {
        const cart = req.body;
        const result = await cartsCollection.insertOne(cart);
        res.json(result);
      });
  
      app.delete('/carts/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await cartsCollection.deleteOne(query);
        res.json(result);
      });
  