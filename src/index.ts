import express, { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

// Initialize app and server
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose
  .connect("mongodb://localhost:27017/socialDB", {
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// User Schema
interface IUser {
  id: string;
  username: string;
  userImage: string;
  followers: string[];
  likes: {
    type: 'thread' | 'reply';
    id: string;
  }[]
}
const userSchema = new mongoose.Schema<IUser>({
  id: { type: String, required: true },
  userImage: { type: String, required: true },
  username: { type: String, required: true },
  followers: { type: [String], default: [] },
  likes: {
    type: [
      {
        type: { type: String, enum: ['thread', 'reply'], required: true },
        id: { type: String, required: true },
      }
    ],
    default: []
  }
});
const User = mongoose.model<IUser>("users", userSchema);

// Thread Schema
interface IReply {
  userId: string;
  content: string;
  time: Date;
  id: string;
  likedUsers: string[];
  threadId: string;
}

const replySchema = new mongoose.Schema<IReply>({
  userId: { type: String, required: true },
  content: { type: String, required: true },
  time: { type: Date, default: Date.now },
  id: { type: String, required: true },
  threadId: { type: String, required: true },
  likedUsers: { type: [String], default: [] }
});

const Reply = mongoose.model<IReply>("replies", replySchema);

interface IThread {
  id: string;
  userId: string;
  content: string;
  likedUsers: string[];
  createdAt: Date;
}
const threadSchema = new mongoose.Schema<IThread>({
  id: { type: String, required: true },
  userId: { type: String, required: true },
  content: { type: String, required: true },
  likedUsers: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});
const Thread = mongoose.model<IThread>("threads", threadSchema);



app.get('/api/users/basic/:userId', async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }
    res.send({
      id: user.id,
      username: user.username,
      userImage: user.userImage,
      followers: user.followers,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

app.get('/api/users', async (req: Request, res: Response) => {
  try {
    const users = await User.find();
    res.send(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).send({ message: "Internal server error" });

  }
});

app.post("/api/users", async (req: Request, res: Response) => {
  try {
    const { id, username, userImage } = req.body;
    const user = new User({ id, username, userImage, followers: [], likes: [] });
    await user.save();
    res.send(user);
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

app.get("/api/users/:userId", async (req: Request, res: Response) => {
  try {

    const user = await User.findOne({ id: req.params.userId });

    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    // Get all threads and replies for the user
    const threads = await Thread.find({ userId: req.params.userId });
    const replies = await Reply.find({ userId: req.params.userId });

    let likesCount = 0;
    threads.forEach((thread) => {
      if (thread.likedUsers.includes(req.params.userId)) {
        likesCount++;
      }
    });
    replies.forEach((reply) => {
      if (reply.likedUsers.includes(req.params.userId)) {
        likesCount++;
      }
    });

    res.send({
      id: user.id,
      username: user.username,
      userImage: user.userImage,
      followers: user.followers,
      likes: user.likes,
      likesCount,
      threads,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// Follow/Unfollow routes
app.post("/api/users/follow/:userId", async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ id: req.params.userId });
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }
    // throw error if followerId is not provided
    if (!req.body.followerId) {
      return res.status(400).send({ message: "Follower ID is required" });
    }

    // throw error if already following
    if (user.followers.includes(req.body.followerId)) {
      return res.status(400).send({ message: "Already following this user" });
    }
    user.followers.push(req.body.followerId);
    await user.save();
    res.send(user);
  } catch (error) {
    console.error("Error following user:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

app.post("/api/users/unfollow/:userId", async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }
    user.followers = user.followers.filter((followerId) => followerId !== req.body.followerId);
    await user.save();
    res.send(user);
  } catch (error) {
    console.error("Error unfollowing user:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// Thread routes
app.post("/api/threads", async (req: Request, res: Response) => {
  try {
    const thread = new Thread(req.body);
    await thread.save();
    res.send(thread);
  } catch (error) {
    console.error("Error creating thread:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});


app.get("/api/threads/:fromTime/:toTime", async (req: Request, res: Response) => {
  try {
    const { fromTime, toTime } = req.params;
    const threads = await Thread.find({
      createdAt: {
        $gte: new Date(parseInt(fromTime)),
        $lte: new Date(parseInt(toTime)),
      },
    }).sort({ createdAt: -1 });
    res.send(threads);
  } catch (error) {
    console.error("Error fetching threads:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// Start server
const PORT = 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
