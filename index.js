const express = require("express");
const dotenv = require("dotenv");

const cors = require("cors");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();
const PORT = process.env.PORT;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get("/", (req, res) => {
  res.send("Hello World!");
});

const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const DB = await client.db("BloodNet");
    const DonationRequest = DB.collection("DonationRequest");
    const Session = DB.collection("session");
    const userCollection = DB.collection("user");
    const funding = DB.collection("Funding");
    const VerifyToken = async (req, res, next) => {
      try {
        const authHeader = req.headers?.authorization;
        console.log(authHeader);
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return res.status(401).json({
            success: false,
            message: "Unauthorized access",
          });
        }

        const token = authHeader.split(" ")[1];
        console.log("our token", token);
        if (!token) {
          return res.status(401).json({
            success: false,
            message: "Unauthorized access",
          });
        }

        const session = await Session.findOne({ token });

        if (!session) {
          return res.status(403).json({
            success: false,
            message: "Forbidden access",
          });
        }

        const user = await userCollection.findOne({
          _id: new ObjectId(session.userId),
        });
        console.log(user);
        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        req.user = user;

        next();
      } catch (error) {
        console.error("Error in verifyToken:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    };
    const verifyAdmin = (req, res, next) => {
      if (req.user?.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Admin access required",
        });
      }

      next();
    };
    const verifyVolunteer = (req, res, next) => {
      if (req.user?.role !== "volunteer") {
        return res.status(403).json({
          success: false,
          message: "Volunteer access required",
        });
      }

      next();
    };
    const verifyDonor = (req, res, next) => {
      if (req.user?.role !== "donor") {
        return res.status(403).json({
          success: false,
          message: "Donor access required",
        });
      }

      next();
    };
    app.get("/api/allInfo", async (req, res) => {
      try {
        const [
          totalUsers,
          totalDonations,
          totalAdmins,
          totalVolunteers,
          totalDonors,
          totalActive,
          totalBlocked,
        ] = await Promise.all([
          userCollection.countDocuments(),
          DonationRequest.countDocuments(),
          userCollection.countDocuments({ role: "admin" }),
          userCollection.countDocuments({ role: "volunteer" }),
          userCollection.countDocuments({ role: "donor" }),
          userCollection.countDocuments({ status: "active" }),
          userCollection.countDocuments({ status: "blocked" }),
        ]);

        return res.status(200).json({
          success: true,
          statistics: {
            totalUsers,
            totalDonations,
            totalAdmins,
            totalVolunteers,
            totalDonors,
            totalActive,
            totalBlocked,
          },
        });
      } catch (error) {
        console.error("Error fetching dashboard statistics:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch dashboard statistics",
        });
      }
    });

    app.get("/allusers", VerifyToken, verifyAdmin, async (req, res) => {
      try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.max(Number(req.query.limit) || 10, 1);
        const skip = (page - 1) * limit;

        const query = {};

        if (req.query.status && req.query.status !== "all") {
          query.status = req.query.status;
        }

        const users = await userCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        const total = await userCollection.countDocuments(query);

        const [
          totalUsers,
          activeUsers,
          blockedUsers,
          donorUsers,
          volunteerUsers,
          adminUsers,
        ] = await Promise.all([
          userCollection.countDocuments(),
          userCollection.countDocuments({ status: "active" }),
          userCollection.countDocuments({ status: "blocked" }),
          userCollection.countDocuments({ role: "donor" }),
          userCollection.countDocuments({ role: "volunteer" }),
          userCollection.countDocuments({ role: "admin" }),
        ]);

        return res.status(200).json({
          success: true,
          data: users,

          statistics: {
            totalUsers,
            activeUsers,
            blockedUsers,
            donorUsers,
            volunteerUsers,
            adminUsers,
          },

          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNext: page < Math.ceil(total / limit),
            hasPrev: page > 1,
          },
        });
      } catch (error) {
        console.error(error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    app.get("/api/donor-data", async (req, res) => {
      try {
        const { grp, district, upazila } = req.query;

        const query = {
          blood_group: grp,
          district,
          upazila,
        };

        const donors = await userCollection.find(query).toArray();

        res.status(200).send({
          success: true,
          count: donors.length,
          data: donors,
        });
      } catch (error) {
        console.error("Failed to fetch donors:", error);

        res.status(500).send({
          success: false,
          message: "Failed to fetch donor data.",
          error: error.message,
        });
      }
    });
    app.patch("/user/:id", VerifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = new ObjectId(req.params.id);
        const data = req.body;

        const result = await userCollection.updateOne(
          { _id: id },
          { $set: data },
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "User updated successfully",
          data: result,
        });
      } catch (error) {
        console.error("Error updating user:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });
    app.patch("/api/profile", VerifyToken, async (req, res) => {
      try {
        const { name, image, blood_group, district, upazila } = req.body;

        const updateData = {};

        if (name !== undefined) updateData.name = name;
        if (image !== undefined) updateData.image = image;
        if (blood_group !== undefined) updateData.blood_group = blood_group;
        if (district !== undefined) updateData.district = district;
        if (upazila !== undefined) updateData.upazila = upazila;

        const result = await userCollection.updateOne(
          {
            _id: req.user._id,
          },
          {
            $set: updateData,
          },
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Profile updated successfully",
        });
      } catch (error) {
        console.error("Error updating profile:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    app.get("/api/donationRequest/:id", VerifyToken, async (req, res) => {
      try {
        const id = new ObjectId(req.params.id);

        const result = await DonationRequest.findOne({ _id: id });

        if (!result) {
          return res.status(404).json({
            success: false,
            message: "Donation request not found",
          });
        }

        return res.status(200).json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("Error fetching donation request:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    app.post("/donation-request", VerifyToken, async (req, res) => {
      try {
        const data = req.body;

        if (data.requester_id !== req.user._id.toString()) {
          return res.status(403).json({
            success: false,
            message: "Forbidden access",
          });
        }

        const donationRequest = {
          ...data,
          createdAt: new Date(),
        };

        const result = await DonationRequest.insertOne(donationRequest);

        return res.status(201).json({
          success: true,
          message: "Donation request created successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error creating donation request:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    app.get("/api/my-request", VerifyToken, async (req, res) => {
      try {
        if (req.query.id !== req.user._id.toString()) {
          return res.status(403).json({
            success: false,
            message: "Forbidden access",
          });
        }
        const query = {};
        if (req.query.id) {
          query.requester_id = req.query.id;
        }

        if (req.query.status) {
          query.status = req.query.status;
        }

        if (req.query.search) {
          query.$or = [
            {
              recipient_name: {
                $regex: req.query.search,
                $options: "i",
              },
            },
            {
              hospital_name: {
                $regex: req.query.search,
                $options: "i",
              },
            },
          ];
        }

        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const result = await DonationRequest.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        const total = await DonationRequest.countDocuments(query);
        console.log(result);
        return res.status(200).json({
          success: true,
          data: result,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNext: page < Math.ceil(total / limit),
            hasPrev: page > 1,
          },
        });
      } catch (error) {
        console.error("Error fetching donation requests:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    app.get("/api/get-request", VerifyToken, async (req, res) => {
      try {
        if (req.user.role === "seeker") {
          return res.status(403).json({
            success: false,
            message: "Unauthorized access",
          });
        }

        const query = {};

        // if (req.query.id) {
        //   query.requester_id = req.query.id;
        // }

        if (req.query.status) {
          query.status = req.query.status;
        }

        if (req.query.search) {
          query.$or = [
            {
              recipient_name: {
                $regex: req.query.search,
                $options: "i",
              },
            },
            {
              hospital_name: {
                $regex: req.query.search,
                $options: "i",
              },
            },
          ];
        }

        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Current page data
        const result = await DonationRequest.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        console.log("3");
        const total = await DonationRequest.countDocuments(query);

        // ---------- Statistics ----------
        const requesterQuery = {};

        // if (req.query.id) {
        //   requesterQuery.requester_id = req.query.id;
        // }

        const [
          totalRequests,
          pendingRequests,
          inprogressRequests,
          completedRequests,
          cancelledRequests,
        ] = await Promise.all([
          DonationRequest.countDocuments(requesterQuery),

          DonationRequest.countDocuments({
            ...requesterQuery,
            status: "pending",
          }),

          DonationRequest.countDocuments({
            ...requesterQuery,
            status: "inprogress",
          }),

          DonationRequest.countDocuments({
            ...requesterQuery,
            status: "done",
          }),

          DonationRequest.countDocuments({
            ...requesterQuery,
            status: "canceled",
          }),
        ]);
        console.log(result);
        return res.status(200).json({
          success: true,

          data: result,

          statistics: {
            totalRequests,
            pendingRequests,
            inprogressRequests,
            completedRequests,
            cancelledRequests,
          },

          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNext: page < Math.ceil(total / limit),
            hasPrev: page > 1,
          },
        });
      } catch (error) {
        console.error("Error fetching donation requests:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    app.get("/api/pending-request", async (req, res) => {
      try {
        const query = {
          status: "pending",
        };

        if (req.query.search?.trim()) {
          query.$or = [
            {
              recipient_name: {
                $regex: req.query.search.trim(),
                $options: "i",
              },
            },
            {
              hospital_name: {
                $regex: req.query.search.trim(),
                $options: "i",
              },
            },
          ];
        }

        if (req.query.blood_group?.trim()) {
          query.blood_group = req.query.blood_group.trim();
        }

        if (req.query.district?.trim()) {
          query.district = req.query.district.trim();
        }

        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const [result, total] = await Promise.all([
          DonationRequest.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray(),

          DonationRequest.countDocuments(query),
        ]);

        return res.status(200).json({
          success: true,
          data: result,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNext: page < Math.ceil(total / limit),
            hasPrev: page > 1,
          },
        });
      } catch (error) {
        console.error("Error fetching pending requests:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });
    app.patch("/api/my-request/:id", VerifyToken, async (req, res) => {
      try {
        const query = {};
        if (req.user.role === "donor" || req.user.role === "volunteer") {
          if (req.query.id !== req.user._id.toString()) {
            return res.status(403).json({
              success: false,
              message: "Forbidden access",
            });
          }
          query.requester_id = req.user._id.toString();
        }

        query._id = new ObjectId(req.params.id);

        const data = {
          ...req.body,
          updatedAt: new Date(),
        };

        const result = await DonationRequest.updateOne(
          { ...query },
          {
            $set: data,
          },
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Donation request not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Donation request updated successfully",
        });
      } catch (error) {
        console.error("Error updating donation request:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    app.patch("/api/statusUpdate/:id", VerifyToken, async (req, res) => {
      try {
        const query = {};
        if (req.user.role === "donor") {
          if (req.query.id !== req.user._id.toString()) {
            return res.status(403).json({
              success: false,
              message: "Forbidden access",
            });
          }
          query.requester_id = req.user._id.toString();
        }
        const id = new ObjectId(req.params.id);
        query._id = id;
        const data = {
          ...req.body,
          updatedAt: new Date(),
        };

        const result = await DonationRequest.updateOne(
          { ...query },
          {
            $set: data,
          },
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Donation request not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Donation request updated successfully",
        });
      } catch (error) {
        console.error("Error updating donation request:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    app.patch("/api/donate/:id", VerifyToken, async (req, res) => {
      try {
        const id = new ObjectId(req.params.id);

        const updateData = {
          status: "inprogress",
          updatedAt: new Date(),
        };

        const result = await DonationRequest.updateOne(
          { _id: id },
          {
            $set: updateData,
          },
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Donation request not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Donation confirmed successfully",
        });
      } catch (error) {
        console.error("Error confirming donation:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    app.delete("/api/deleteRequest/:id", VerifyToken, async (req, res) => {
      try {
        const id = new ObjectId(req.params.id);

        let filter = { _id: id };

        if (req.user.role === "donor" || req.user.role == "volunteer") {
          if (req.query.id !== req.user._id.toString()) {
            return res.status(403).json({
              success: false,
              message: "Forbidden access",
            });
          }

          filter.requester_id = req.user._id.toString();
        }
        console.log(filter);
        const result = await DonationRequest.deleteOne(filter);

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Donation request not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Donation request deleted successfully",
        });
      } catch (error) {
        console.error("Error deleting donation request:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });
    app.get("/api/my-request/latest", VerifyToken, async (req, res) => {
      try {
        const requesterId = req.user._id.toString();

        const [
          latestRequests,
          totalRequests,
          pendingRequests,
          completedRequests,
        ] = await Promise.all([
          DonationRequest.find({ requester_id: requesterId })
            .sort({ createdAt: -1 })
            .limit(3)
            .toArray(),

          DonationRequest.countDocuments({
            requester_id: requesterId,
          }),

          DonationRequest.countDocuments({
            requester_id: requesterId,
            status: "pending",
          }),

          DonationRequest.countDocuments({
            requester_id: requesterId,
            status: "done",
          }),
        ]);

        return res.status(200).json({
          success: true,
          data: latestRequests,
          statistics: {
            totalRequests,
            pendingRequests,
            completedRequests,
          },
        });
      } catch (error) {
        console.error("Error fetching dashboard data:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    app.post("/api/verify-payment", VerifyToken, async (req, res) => {
      try {
        const { session_id } = req.body;

        if (!session_id) {
          return res.status(400).json({
            success: false,
            message: "Missing session_id in request body",
          });
        }

        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (
          session.payment_status !== "paid" ||
          session.status !== "complete"
        ) {
          return res.status(400).json({
            success: false,
            message: "Payment verification failed on Stripe side",
          });
        }

        const sessionUserId = session.metadata?.userId;
        if (sessionUserId !== req.user._id.toString()) {
          return res.status(403).json({
            success: false,
            message: "Security Alert! User identifier mismatch.",
          });
        }

        const isAlreadyProcessed = await funding.findOne({
          stripeSessionId: session_id,
        });
        if (isAlreadyProcessed) {
          return res.status(200).json({
            success: true,
            message: "Payment already verified and recorded",
          });
        }

        const donationData = {
          userId: req.user._id,
          userName: req.user.name,
          userEmail: session.customer_details?.email || req.user.email,
          amount: Number(
            session.metadata?.amount || session.amount_total / 100,
          ),
          stripeSessionId: session_id,
          paymentStatus: "COMPLETED",
          createdAt: new Date(),
        };

        const result = await funding.insertOne(donationData);

        return res.status(201).json({
          success: true,
          message: "Payment verified successfully and saved to MongoDB!",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error in verifying payment:", error);
        return res.status(500).json({
          success: false,
          message:
            "Internal server error during verification: " + error.message,
        });
      }
    });

    app.get("/api/my_funding", VerifyToken, async (req, res) => {
      const query = {
        // userId: new ObjectId(req.user._id),
      };

      if (req.user.role === "admin" && req.query.status === "1") {
        delete query.userId;
      }

      const [data] = await funding
        .aggregate([
          {
            $match: query,
          },
          {
            $facet: {
              result: [
                {
                  $sort: { createdAt: -1 },
                },
              ],
              summary: [
                {
                  $group: {
                    _id: null,
                    totalAmount: { $sum: "$amount" },
                  },
                },
              ],
            },
          },
        ])
        .toArray();

      res.send({
        success: true,
        result: data.result,
        totalAmount: data.summary[0]?.totalAmount || 0,
      });
    });

    app.get("/api/total_funding", async (req, res) => {
      try {
        const result = await funding
          .aggregate([
            {
              $group: {
                _id: null,
                totalAmount: { $sum: "$amount" },
              },
            },
          ])
          .toArray();

        res.status(200).send({
          success: true,
          totalAmount: result[0]?.totalAmount || 0,
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Failed to calculate total funding.",
          error: error.message,
        });
      }
    });
    //await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
