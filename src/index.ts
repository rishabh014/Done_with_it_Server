import "dotenv/config";
import express from "express";
import "express-async-errors";
import authRouter from "./routes/auth";
import "src/db";
import formidable from "formidable";
import path from "path";
import http from "http";
import productRouter from "./routes/product";
import { sendErrorRes } from "./utils/helper";
import { Server } from "socket.io";
import { verify } from "crypto";
import jwt from "jsonwebtoken"; //addition
import { TokenExpiredError } from "jsonwebtoken";
import morgan from "morgan";
import conversationRouter from "./routes/conversation";
import ConversationModel from "./models/conversation";
import { timeStamp } from "console";
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  path: "/socket-message",
});

app.use(morgan("dev"));
app.use(
  cors({
    origin: "*", // Replace with your React Native app's domain
    credentials: true, // Set to true if your API requires sending cookies or tokens
  })
);

//parse incoming req bodies in middleware
app.use(express.static("src/public")); //serving static files
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

//API routes
app.use("/auth", authRouter);
app.use("/product", productRouter);
app.use("/conversation", conversationRouter);

//Socket IO
// io.use((socket, next) => {
//   const socketReq = socket.handshake.auth as { token: string } | undefined;
//   if (!socketReq?.token) {
//     return next(new Error("Unauthorized request!"));
//   }

//   jwt.verify(socketReq.token, process.env.SECRET_KEY!);

//   next();
// });

io.use((socket, next) => {
  const socketReq = socket.handshake.auth as { token: string } | undefined;
  if (!socketReq?.token) {
    return next(new Error("Unauthorized req!"));
  }
  try {
    socket.data.jwtDecode = jwt.verify(
      socketReq.token,
      process.env.SECRET_KEY!
    );
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      return next(new Error("jwt expired"));
    }
    return next(new Error("Invalid token!"));
  }
  next();
});

type MessageProfile = {
  id: string;
  name: string;
  avatar?: string;
};

type IncomingMessage = {
  message: {
    id: string;
    time: string;
    text: string;
    user: MessageProfile;
  };
  to: string;
  conversationId: string;
};

type OutgoingMessageResponse = {
  message: {
    id: string;
    time: string;
    text: string;
    user: MessageProfile;
  };
  from: string;
  conversationId: string;
};

io.on("connection", (socket) => {
  const socketData = socket.data as { jwtDecode: { id: string } };
  const userId = socketData.jwtDecode.id;

  socket.join(userId);

  // console.log("a new client is connected to server");
  socket.on("chat:new", async (data: IncomingMessage) => {
    const { conversationId, message, to } = data;

    await ConversationModel.findByIdAndUpdate(conversationId, {
      $push: {
        chats: {
          sentBy: message.user.id,
          content: message.text,
          timeStamp: message.time,
        },
      },
    });

    const messageResponse: OutgoingMessageResponse = {
      from: message.user.id,
      conversationId,
      message: message,
    };

    socket.to(to).emit("chat:message", messageResponse);
    // console.log(data);
  });
});

//file upload locally through - Formidable below
app.post("/upload-file", async (req, res) => {
  const form = formidable({
    uploadDir: path.join(__dirname, "public"),
    filename(name, ext, part, form) {
      return Date.now() + "_" + part.originalFilename;
    },
  });
  await form.parse(req);
  res.send("Ok");
});

app.use(function (err, req, res, next) {
  res.status(500).json({ message: err.message });
} as express.ErrorRequestHandler);

app.use("*", (req, res) => {
  sendErrorRes(res, "Not Found", 404);
});

//listen on port 8000
server.listen(8000, () => {
  console.log("Server is running on http://localhost:8000");
});
