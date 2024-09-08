import { Router } from "express";
import {
  getConversations,
  getOrCreateConversation,
} from "src/controllers/conversation";
import { isAuth } from "src/middleware/auth";

const conversationRouter = Router();

conversationRouter.get("/with/:peerId", isAuth, getOrCreateConversation);

conversationRouter.get("/chats/:conversationId", isAuth, getConversations);

export default conversationRouter;
