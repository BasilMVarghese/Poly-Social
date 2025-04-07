import express, { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import Pusher from 'pusher'

// Initialize app and server
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
// Middleware
app.use(cors());
app.use(express.json());

const pusher = new Pusher({
  appId: "1970757",
  key: "47a8c0b9875e46f41332",
  secret: "127eea309bca6190bcff",
  cluster: "ap2",
  useTLS: true
});

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


app.get('/health', (req: Request, res: Response) => {
  res.send({ message: "Server is healthy" });
});

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
      return res.status(501).send({ message: "User not found" });
    }

    // Get all threads and replies for the user
    const threads = await Thread.find({ userId: req.params.userId });
    const replies = await Reply.find({ userId: req.params.userId });

    let followersFull = await Promise.all(user.followers.map(async (followerId) => {
      const follower = await User.findOne({ id: followerId });
      if (follower) {
        return {
          id: follower.id,
          username: follower.username,
          userImage: follower.userImage,
          followers: follower.followers,
        };
      }
      return null;
    }));


    let likesCount = 0;
    threads.forEach((thread) => {
      likesCount += thread.likedUsers.length;
    });
    replies.forEach((reply) => {
      likesCount += reply.likedUsers.length;
    });

    res.send({
      id: user.id,
      username: user.username,
      userImage: user.userImage,
      followers: followersFull,
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
    const user = await User.findOne({ id: req.params.userId });
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }
    //throw error if followerId is not provided
    if (!req.body.followerId) {
      return res.status(400).send({ message: "Follower ID is required" });
    }
    // throw error if not following
    if (!user.followers.includes(req.body.followerId)) {
      return res.status(400).send({ message: "Not following this user" });
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
    //Validate request body
    if (!req.body.id || !req.body.userId || !req.body.content) {
      return res.status(400).send({ message: "Thread ID, user ID, and content are required" });
    }
    const thread = new Thread(req.body);
    await thread.save();
    pusher.trigger('main-threads', 'new-thread', {
      id: thread.id,
      userId: thread.userId,
      content: thread.content,
      createdAt: thread.createdAt,
      likedUsers: thread.likedUsers,
    })
    res.send(thread);
  } catch (error) {
    console.error("Error creating thread:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});


app.get("/api/threads/:includAllDetails", async (req: Request, res: Response) => {
  try {

    const threads = await Thread.find().sort({ createdAt: 1 });
    let fullThreasd = [];
    const { includAllDetails } = req.params;
    if (includAllDetails === "true") {
      for (const thread of threads) {
        const replies = await Reply.find({ threadId: thread.id }).sort({ time: 1 });
        const user = await User.findOne({ id: thread.userId })
        fullThreasd.push({
          ...thread.toObject(),
          replies: replies.map((reply) => ({
            ...reply.toObject(),
            threadId: thread.id,
          })),
          user: {
            id: user?.id,
            username: user?.username,
            userImage: user?.userImage,
            followers: user?.followers,
          },
        });
        ;

      }
    }
    res.send(includAllDetails === "true" ? fullThreasd : threads);
  } catch (error) {
    console.error("Error fetching threads:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

app.post("/api/threads/like/:threadId", async (req: Request, res: Response) => {
  try {
    const thread = await Thread.findOne({ id: req.params.threadId });
    if (!thread) {
      return res.status(404).send({ message: "Thread not found" });
    }
    //throw error if userId is not provided
    if (!req.body.userId) {
      return res.status(400).send({ message: "User ID is required" });
    }
    // throw error if already liked
    if (thread.likedUsers.includes(req.body.userId)) {
      return res.status(400).send({ message: "Already liked this thread" });
    }
    thread.likedUsers.push(req.body.userId);
    await thread.save();
    res.send(thread);
  }
  catch (error) {
    console.error("Error liking thread:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

app.post("/api/threads/unlike/:threadId", async (req: Request, res: Response) => {
  try {
    const thread = await Thread.findOne({ id: req.params.threadId });
    if (!thread) {
      return res.status(404).send({ message: "Thread not found" });
    }
    //throw error if userId is not provided
    if (!req.body.userId) {
      return res.status(400).send({ message: "User ID is required" });
    }
    // throw error if not liked
    if (!thread.likedUsers.includes(req.body.userId)) {
      return res.status(400).send({ message: "Not liked this thread" });
    }
    thread.likedUsers = thread.likedUsers.filter((userId) => userId !== req.body.userId);
    await thread.save();
    res.send(thread);
  }
  catch (error) {
    console.error("Error unliking thread:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});


app.post("/api/replies", async (req: Request, res: Response) => {
  try {
    //Validate request body
    if (!req.body.id || !req.body.userId || !req.body.content || !req.body.threadId) {
      return res.status(400).send({ message: "Reply ID, user ID, content, and thread ID are required" });
    }
    const reply = new Reply(req.body);
    await reply.save();
    res.send(reply);
  }
  catch (error) {
    console.error("Error creating reply:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

app.get("/api/replies/:threadId", async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    //throw error if threadId is not provided
    if (!threadId) {
      return res.status(400).send({ message: "Thread ID is required" });
    }
    const replies = await Reply.find({ threadId }).sort({ time: -1 });
    res.send(replies);
  } catch (error) {
    console.error("Error fetching replies:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

app.post("/api/replies/like/:replyId", async (req: Request, res: Response) => {
  try {
    const reply = await Reply.findOne({ id: req.params.replyId });
    if (!reply) {
      return res.status(404).send({ message: "Reply not found" });
    }
    //throw error if userId is not provided
    if (!req.body.userId) {
      return res.status(400).send({ message: "User ID is required" });
    }
    // throw error if already liked
    if (reply.likedUsers.includes(req.body.userId)) {
      return res.status(400).send({ message: "Already liked this reply" });
    }
    reply.likedUsers.push(req.body.userId);
    await reply.save();
    res.send(reply);
  } catch (error) {
    console.error("Error liking reply:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});


app.post("/api/replies/unlike/:replyId", async (req: Request, res: Response) => {
  try {
    const reply = await Reply.findOne({ id: req.params.replyId });
    if (!reply) {
      return res.status(404).send({ message: "Reply not found" });
    }
    //throw error if userId is not provided
    if (!req.body.userId) {
      return res.status(400).send({ message: "User ID is required" });
    }
    // throw error if not liked
    if (!reply.likedUsers.includes(req.body.userId)) {
      return res.status(400).send({ message: "Not liked this reply" });
    }
    reply.likedUsers = reply.likedUsers.filter((userId) => userId !== req.body.userId);
    await reply.save();
    res.send(reply);
  } catch (error) {
    console.error("Error unliking reply:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// Start server
const PORT = 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('createThread', async (msg: { userId: string; content: string }) => {
    const thread = new Thread({ id: new Types.ObjectId().toString(), ...msg });
    await thread.save();

    socket.broadcast.emit('threadCreated', thread);
  });

  socket.on('createReply', async (msg: { userId: string; content: string; threadId: string }) => {
    const reply = new Reply({ id: new Types.ObjectId().toString(), ...msg });
    await reply.save();
    socket.broadcast.emit('replyCreated', reply);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});
