import { RequestHandler } from "express";
import { isValidObjectId, ObjectId } from "mongoose";
import ConversationModel from "src/models/conversation";
import UserModel from "src/models/user";
import { sendErrorRes } from "src/utils/helper";

// Define the UserProfile interface
interface UserProfile {
  id: string;
  name: string;
  avatar?: string;
}

// Define the Chat interface
interface Chat {
  text: string;
  time: string;
  id: string;
  viewed: boolean;
  user: UserProfile;
}

interface Conversation {
  id: string;
  chats: Chat[];
  peerProfile: {
    avatar?: string;
    name: string;
    id: string;
  };
}

type PopulatedChat = {
  _id: ObjectId;
  content: string;
  timestamp: Date;
  sentBy: { name: string; id_: ObjectId; avatar?: { url: string } };
};
export const getOrCreateConversation: RequestHandler = async (req, res) => {
  const { peerId } = req.params;

  if (!isValidObjectId(peerId)) {
    return sendErrorRes(res, "Invalid peerId", 422);
  }

  try {
    const user = await UserModel.findById(peerId);
    if (!user) {
      return sendErrorRes(res, "User not found", 404);
    }

    const participants = [req.user.id, peerId].sort();
    const participantId = participants.join("_");

    const conversation = await ConversationModel.findOneAndUpdate(
      { participantId },
      {
        $setOnInsert: { participantId, participants },
      },
      { upsert: true, new: true }
    );

    if (!conversation) {
      return sendErrorRes(
        res,
        "Failed to create or retrieve conversation",
        500
      );
    }

    console.log("Conversation found/created:", conversation);
    res.json({ conversationId: conversation._id });
  } catch (error) {
    console.error("Error in getOrCreateConversation:", error);
    sendErrorRes(res, "Internal Server Error", 500);
  }
};

export const getConversations: RequestHandler = async (req, res) => {
  const { conversationId } = req.params;

  if (!isValidObjectId(conversationId)) {
    return sendErrorRes(res, "Invalid conversation id", 422);
  }

  const conversation = await ConversationModel.findById(conversationId)
    .populate<PopulatedChat[]>({
      path: "chats.sentBy",
      select: "name avatar.url",
    })
    .populate({
      path: "participants",
      match: { _id: { $ne: req.user.id } },
      select: "name avatar.url",
    })
    .select("sentBy chats._id chats.content chats.timestamp participants");

  if (!conversation) return sendErrorRes(res, "Details not found!", 404);
  // const finalConversation: Conversation = {};
  console.log(JSON.stringify(conversation, null, 2));
  res.json({});
};
