const express = require('express');
const app = express();

const cors = require('cors');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;

// middlewares
app.use(cors());
app.use(express.json());


const uri = process.env.MONGO_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    console.log("MongoDB connected");

    const database = client.db("academixDb");
    const userCollection = database.collection("users");
    const classesCollection = database.collection('classes');
    const teacherRequestsCollection = database.collection("teacherRequests");
    const assignmentsCollection = database.collection("assignments");
    const paymentsCollection = database.collection("payments");
    const feedbackCollection = database.collection('feedback')


    // jwt api

    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token })
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      // console.log(req.headers.authorization)
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Unauthorized request' });
      }

      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(403).send({ message: 'Forbidden request' });
        }
        req.decoded = decoded;
        next();
      });
    }

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'Forbidden request' });
      }
      next();
    }

    // User Collection

    app.get('/users', verifyToken, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden request' });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let isAdmin = false;
      if (user.role === 'admin') {
        isAdmin = true;
      }
      res.send(isAdmin);
    });

    app.get('/users/teacher/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden request' });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let isTeacher = false;
      if (user.role === 'teacher') {
        isTeacher = true;
      }
      res.send(isTeacher);
    });


    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        res.send({ message: 'User already exists', insertedId: existingUser._id });
        return;
      }

      // Set default role to "normal" if not provided
      user.role = user.role || 'normal';

      const result = await userCollection.insertOne(user);
      res.json(result);
    });

    // Update User Role
    app.patch('/users/role/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const { role } = req.body; // Expecting role: 'admin', 'premium', or 'normal'
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { role },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.json(result);
    });


    app.delete('/users/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.json(result);
    });


    // Payment Routes

    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      // console.log(price);
      // const amount = price * 100;
      // const amount = price * 100;

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: price,
        currency: "usd",
        // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // Payment Routes end

    //Payment collection

    app.post('/payments', verifyToken, async (req, res) => {
      const payment = req.body;
      const { classId } = req.body;
      console.log(classId);

      const updatedClass = await classesCollection.updateOne(
        { _id: new ObjectId(classId) },
        { $inc: { totalEnrollments: 1 } }
      );
      // console.log(enrolled)
      const result = await paymentsCollection.insertOne(payment);
      res.json({ result, updatedClass });
    });

    app.get('/payments/:email', verifyToken, async (req, res) => {

      const query = { email: req.params.email }
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden request' });
      }
      const payments = await paymentsCollection.find(query).toArray();
      res.send(payments);
    });


    app.get('/payments', verifyToken, verifyAdmin, async (req, res) => {
      const payments = await paymentsCollection.find().toArray();
      res.send(payments);
    });

    app.patch('/payments/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: payment,
      };
      const result = await paymentsCollection.updateOne(query, updateDoc);
      res.json(result);
    });




    // My classes

    app.get('/api/my-enrolled-classes/:userEmail', async (req, res) => {
      try {
        const userEmail = req.params.userEmail;
        const payments = await paymentsCollection.find({ email: userEmail }).toArray();
        const classIds = payments.map(payment => new ObjectId(payment.classId));
        const enrolledClasses = await classesCollection
          .find({ _id: { $in: classIds.map(id => new ObjectId(id)) } }) // Ensure classIds are converted to ObjectId
          .toArray();

        res.send(enrolledClasses);

      } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while fetching enrolled classes.', error });
      }
    });







    // Classes Collection
    app.post('/api/classes', async (req, res) => {
      try {
        const { title, name, email, price, description, image } = req.body;

        if (!title || !name || !email || !price || !description || !image) {
          return res.status(400).json({ message: 'All fields are required' });
        }

        const newClass = {
          title,
          name,
          email,
          price: parseFloat(price),
          description,
          image,
          status: 'pending', // Default status
          createdAt: new Date(),
        };

        const result = await classesCollection.insertOne(newClass);

        res.status(201).json({
          message: 'Class added successfully',
          classId: result.insertedId,
        });
      } catch (error) {
        console.error('Error adding class:', error);
        res.status(500).json({ message: 'Failed to add class. Please try again.' });
      }
    });

    // Fetch all approved classes
    app.get('/api/classes', async (req, res) => {
      try {
        const approvedClasses = await classesCollection.find({ status: 'approved' }).toArray();
        res.status(200).json(approvedClasses);
      } catch (error) {
        console.error('Error fetching classes:', error);
        res.status(500).json({ message: 'Failed to fetch classes. Please try again.' });
      }
    });

    // Admin: Approve class
    // Admin: Get all classes (pending, approved, rejected)
    app.get('/api/admin/classes', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const classes = await classesCollection.find().toArray();
        // console.log(classes);
        res.json(classes);
      } catch (error) {
        console.error('Error fetching classes:', error);
        res.status(500).json({ message: 'Failed to fetch classes. Please try again.' });
      }
    });

    // Admin: Approve class
    app.patch('/api/classes/approve/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const classId = req.params.id;
        const updateResult = await classesCollection.updateOne(
          { _id: new ObjectId(classId) },
          { $set: { status: 'approved' } }
        );

        if (updateResult.modifiedCount === 0) {
          return res.status(404).json({ message: 'Class not found' });
        }

        res.json({ message: 'Class approved successfully' });
      } catch (error) {
        console.error('Error approving class:', error);
        res.status(500).json({ message: 'Failed to approve class. Please try again.' });
      }
    });




    // Get Teacher

    // Route to fetch all teacher's classes
    // Route to fetch all teacher's classes


    app.get('/api/classes/:id', async (req, res) => {
      try {
        const classId = req.params.id;
        const classDetails = await classesCollection.findOne({ _id: new ObjectId(classId) });

        if (!classDetails) {
          return res.status(404).json({ message: 'Class not found' });
        }

        res.json(classDetails);
      } catch (error) {
        console.error('Error fetching classes:', error);
        res.status(500).json({ message: 'Failed to fetch classes. Please try again.' });
      }
    });
    app.get('/api/teacher/classes', async (req, res) => {
      try {
        const { email } = req.query; // Get email from query parameters

        const classes = await classesCollection.find({ email: email }).toArray();
        res.json(classes);
      } catch (error) {
        console.error('Error fetching classes:', error);
        res.status(500).json({ message: 'Failed to fetch classes. Please try again.' });
      }
    });


    // Route to delete class
    app.delete('/api/classes/:id', async (req, res) => {
      try {
        const classId = req.params.id;
        const deleteResult = await classesCollection.deleteOne({ _id: new ObjectId(classId) });

        if (deleteResult.deletedCount === 0) {
          return res.status(404).json({ message: 'Class not found' });
        }

        res.json({ message: 'Class deleted successfully' });
      } catch (error) {
        console.error('Error deleting class:', error);
        res.status(500).json({ message: 'Failed to delete class. Please try again.' });
      }
    });

    app.put('/api/classes/:id', async (req, res) => {
      const { id } = req.params;
      const updatedData = { ...req.body }; // Clone the request body to avoid mutating it directly

      try {
        // Remove `_id` field from the update data to prevent issues
        delete updatedData._id;

        const result = await classesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        if (result.modifiedCount > 0) {
          res.json({ message: 'Class updated successfully' });
        } else {
          res.status(404).json({ message: 'Class not found or no changes made' });
        }
      } catch (error) {
        console.error('Error updating class:', error);
        res.status(500).json({ message: 'Failed to update class. Please try again.' });
      }
    });


    // assignments 
    // Create assignment
    app.post('/api/assignments', async (req, res) => {
      try {
        const assignment = req.body;
        const result = await assignmentsCollection.insertOne(assignment);
        res.json(result);
      } catch (error) {
        console.error('Error creating assignment:', error);
        res.status(500).json({ message: 'Failed to create assignment.' });
      }
    });

    // Get assignments by class ID
    app.get('/api/assignments/:classId', async (req, res) => {
      try {
        const { classId } = req.params;
        const assignments = await assignmentsCollection.find({ classId }).toArray();
        res.json(assignments);
      } catch (error) {
        console.error('Error fetching assignments:', error);
        res.status(500).json({ message: 'Failed to fetch assignments.' });
      }
    });


    app.post('/api/submit-assignment', async (req, res) => {
      try {
        const { assignmentId } = req.body;
        await assignmentsCollection.updateOne(
          { _id: new ObjectId(assignmentId) },
          { $inc: { submissionCount: 1 } }
        );
        res.status(200).send({ message: 'Assignment submitted successfully!' });
      } catch (error) {
        res.status(500).send({ message: 'Failed to submit assignment.', error });
      }
    });


    app.post('/api/feedback', async (req, res) => {
      try {
        const feedback = req.body;
        await feedbackCollection.insertOne(feedback);
        res.status(200).send({ message: 'Feedback submitted successfully!' });
      } catch (error) {
        res.status(500).send({ message: 'Failed to submit feedback.', error });
      }
    });

    app.get('/api/feedback', async (req, res) => {
      try {



      } catch {

      }
    })












    // teacher request collection
    // 1. Submit Teacher Request
    app.post("/api/teacher-requests", async (req, res) => {
      try {
        const { name, email, image, title, experience, category } = req.body;

        // Check if all required fields are present
        if (!name || !email || !image || !title || !experience || !category) {
          return res.status(400).json({ message: "All fields are required" });
        }

        // Check if a request already exists for the user
        const existingRequest = await teacherRequestsCollection.findOne({ email });
        if (existingRequest) {
          return res.status(400).json({ message: "You already have a pending or processed request" });
        }

        // Create a new teacher request
        const newRequest = {
          name,
          email,
          image,
          title,
          experience,
          category,
          status: "pending",
          createdAt: new Date(),
        };

        const result = await teacherRequestsCollection.insertOne(newRequest);
        res.status(201).json({ message: "Request submitted successfully", requestId: result.insertedId });
      } catch (error) {
        console.error("Error submitting teacher request:", error);
        res.status(500).json({ message: "Failed to submit request. Please try again." });
      }
    });

    // 2. Get Teacher Request Status for a User
    app.get("/api/teacher-requests/:email", async (req, res) => {
      try {
        const email = req.params.email;
        // if (email !== req.decoded.email) {
        //   return res.status(403).send({ message: "Forbidden request" });
        // }

        const request = await teacherRequestsCollection.findOne({ email });
        if (!request) {
          return res.status(404).json({ message: "No request found for this email" });
        }

        res.json(request);
      } catch (error) {
        console.error("Error fetching teacher request:", error);
        res.status(500).json({ message: "Failed to fetch request. Please try again." });
      }
    });

    // 3. Admin: Get All Teacher Requests
    app.get("/api/teacher-requests", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const requests = await teacherRequestsCollection.find().toArray();
        res.json(requests);
      } catch (error) {
        console.error("Error fetching teacher requests:", error);
        res.status(500).json({ message: "Failed to fetch teacher requests. Please try again." });
      }
    });

    // 4. Admin: Approve Teacher Request
    app.patch('/api/teacher-requests/approve/:id', async (req, res) => {
      try {
        const id = req.params.id;

        const teacher = await teacherRequestsCollection.findOne({ _id: new ObjectId(id) });
        // console.log(teacher);
        const updateResult = await teacherRequestsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: 'accepted' } }
        );

        if (updateResult.modifiedCount === 0) {
          return res.status(404).json({ message: 'Request not found' });
        }

        const request = await teacherRequestsCollection.findOne({ _id: new ObjectId(id) });
        await userCollection.updateOne(
          { email: request.email },
          { $set: { role: 'teacher' } }
        );

        res.json({ message: 'Request approved successfully' });
      } catch (error) {
        console.error('Error approving teacher request:', error);
        res.status(500).json({ message: 'Failed to approve request. Please try again.' });
      }
    });
    // 5. Admin: Reject Teacher Request
    app.patch('/api/teacher-requests/reject/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const updateResult = await teacherRequestsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: 'rejected' } }
        );

        if (updateResult.modifiedCount === 0) {
          return res.status(404).json({ message: 'Request not found' });
        }

        res.json({ message: 'Request rejected successfully' });
      } catch (error) {
        console.error('Error rejecting teacher request:', error);
        res.status(500).json({ message: 'Failed to reject request. Please try again.' });
      }
    });






    // <-------------------------- see temp code -------------------------------->

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send(' Server!');
});


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
