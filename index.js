import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
const port = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// sy
const logger = (req, res, next) => {
  console.log('logger logged', req.params);
  next();
}

// MongoDB Client & Global Collections
const client = new MongoClient(process.env.MONGODB_URI);
let userCollection;
let jobCollection;
let companyCollection;
let applicationsCollection;
let plansCollection;
let subscriptionCollection;
let sessionCollection;

// Connect to MongoDB and Start Server
async function startServer() {
  try {
    await client.connect();
    const database = client.db("jibika_db");

    // Assign collections globally
    jobCollection = database.collection("jobs");
    companyCollection = database.collection("company");
    applicationsCollection = database.collection("applications");
    plansCollection = database.collection("plans");
    subscriptionCollection = database.collection("subscriptions");
    userCollection = database.collection("user");
    sessionCollection = database.collection("session");

    console.log("Successfully connected to MongoDB!");

    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  } catch (err) {
    console.error("Failed to connect to MongoDB, server not started:", err);
  }
}

startServer();



// sy
const verifyToken = async (req, res, next) => {
  console.log('headers', req.headers)
  const authHeader = req.headers?.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'Unauthorized Access.' })
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).send({ message: "Unauthorized Access." });
  }

  const query = { token: token };
  const session = await sessionCollection.findOne(query);

  if (!session) {
    return res.status(401).send({ message: "Unauthorized Access." });
  }

  const userId = session.userId;
  const userQuery = {
    _id: userId
  }
  const user = await userCollection.findOne(userQuery);
  if (!user) {
    return res.status(401).send({ message: "Unauthorized Access." });
  }
  // set data in the req object
  req.user = user;

  next();
}

// sy
// must be used after verifyToken middleware
const verifySeeker = async (req, res, next) => {
  if (req.user?.role !== 'seeker') {
    return res.status(403).send({ message: 'forbidden access.' })
  }
  next();
}
const verifyRecruiter = async (req, res, next) => {
  if (req.user.role !== 'recruiter') {
    return res.status(403).send({ message: 'forbidden access.' })
  }
  next();
}
const verifyAdmin = async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).send({ message: 'forbidden access.' })
  }
  next();
}


// ==========================================
// Root Endpoint
// ==========================================
app.get('/', (req, res) => {
  res.send('Jibika Backend Server is Running!');
});

// ==========================================
// Job Endpoints
// ==========================================
app.get('/api/jobs', async (req, res) => {
  try {
    const query = {};

    // job filter query
    if (req.query.search) {
      query.$or = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { company: { $regex: req.query.search, $options: 'i' } },
      ]
    }
    if (req.query.jobType) {
      query.jobType = req.query.jobType
    }
    if (req.query.jobCategory) {
      query.category = req.query.jobCategory
    }

    // company query
    if (req.query.companyId) {
      query.companyId = req.query.companyId;
    }


    // pagination related work
    if (req.query.page) {
      const page = req.query.page;
      const perPage = req.query.perPage || 10;
      const skipItems = (page - 1) * perPage;

      const total=await jobCollection.countDocuments(query)
      const cursor = jobCollection.find(query).skip(skipItems).limit(perPage);
      const jobs = await cursor.toArray();
      return res.send({jobs,total});
    }


    const result = await jobCollection.find(query).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

app.get('/api/jobs/:id', async (req, res) => {
  try {
    const result = await jobCollection.findOne({ _id: new ObjectId(req.params.id) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch job details" });
  }
});

app.post('/api/jobs', async (req, res) => {
  try {
    const newJob = { ...req.body, createdAt: new Date() };
    const result = await jobCollection.insertOne(newJob);
    res.status(201).json(result);
  } catch (err) {
    console.error("Error inserting job:", err);
    res.status(500).json({ error: "Failed to insert job into database" });
  }
});

// ==========================================
// Company Endpoints
// ==========================================

app.get('/api/companies', verifyToken, async (req, res) => {
  try {
    const result = await companyCollection.find().toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch companies" });
  }
});



app.get('/api/my/companies', async (req, res) => {
  try {
    const query = {};
    if (req.query.recruiterId) {
      query.recruiterId = req.query.recruiterId;
    }
    const result = await companyCollection.findOne(query);
    res.json(result || {});
  } catch (err) {
    console.error("Error fetching company:", err);
    res.status(500).json({ error: "Failed to fetch company" });
  }
});

app.post('/api/companies', async (req, res) => {
  try {
    const newCompany = { ...req.body, createdAt: new Date() };
    const result = await companyCollection.insertOne(newCompany);
    res.status(201).json({ insertedId: result.insertedId });
  } catch (err) {
    console.error("Error inserting company:", err);
    res.status(500).json({ error: "Failed to insert company into database" });
  }
});

app.patch('/api/companies/:id', logger, verifyToken, async (req, res) => {
  const id = req.params.id;
  const updatedCompany = req.body;
  const filter = { _id: new ObjectId(id) };
  const updatedDoc = {
    $set: {
      status: updatedCompany.status
    }
  }
  const result = await companyCollection.updateOne(filter, updatedDoc);
  res.send(result);
})

// ==========================================
// Application Endpoints
// ==========================================
app.get('/api/applications', verifyToken, verifySeeker, async (req, res) => {
  try {
    const query = {};
    if (req.query.applicantId) {
      query.applicantId = req.query.applicantId;

      // sy
      // check whether asking for information or someone else
      console.log(req.user, req.query.applicantId)
      if (req.user._id.toString() !== req.query.applicantId) {
        return res.status(403).send({ message: "Forbidden access!" })
      }
    }
    if (req.query.jobId) query.jobId = req.query.jobId;

    const result = await applicationsCollection.find(query).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch applications" });
  }
});

app.post('/api/applications', async (req, res) => {
  try {
    const newApplication = { ...req.body, createdAt: new Date() };
    const result = await applicationsCollection.insertOne(newApplication);
    res.status(201).json(result);
  } catch (err) {
    console.error("Error inserting application:", err);
    res.status(500).json({ error: "Failed to submit application" });
  }
});

// ==========================================
// Plan Endpoints
// ==========================================
app.get('/api/plans', async (req, res) => {
  try {
    const query = {};
    if (req.query.plan_id) {
      query.id = req.query.plan_id;
    }
    const result = await plansCollection.findOne(query);
    res.json(result || null);
  } catch (err) {
    console.error("Error fetching plan:", err);
    res.status(500).json({ error: "Failed to fetch plan details" });
  }
});


// ==========================================
// Subscription Endpoints
// ==========================================
app.post("/api/subscriptions", async (req, res) => {
  const data = req.body;
  const filter = { email: data.email };
  const updateDoc = {
    $set: {
      ...data,
      createdAt: new Date()
    }
  }
  const options = { upsert: true };
  await subscriptionCollection.updateOne(filter, updateDoc, options);

  // update the user plan information
  // update the value of plan
  const updateDocument = {
    $set: {
      plan: data.planId,
    }
  }
  const updateResult = await userCollection.updateOne(filter, updateDocument);
  res.send(updateResult);
})