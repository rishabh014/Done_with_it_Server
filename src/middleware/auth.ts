import { RequestHandler } from "express";
import { sendErrorRes } from "src/utils/helper";
import jwt, { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import UserModel from "src/models/user";
import PasswordResetTokenModel from "src/models/passwordResetToken";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  verified: boolean;
  avatar?: string;
}

declare global {
  namespace Express {
    interface Request {
      user: UserProfile;
    }
  }
}

const SECRET_KEY = process.env.SECRET_KEY!;

export const isAuth: RequestHandler = async (req, res, next) => {
  //Configured code below
  try {
    // Read authorization header
    const authToken = req.headers.authorization;
    if (!authToken) return sendErrorRes(res, "Unauthorized request", 401);

    // Verify the token (using JWT)
    const token = authToken.split("Bearer ")[1]; // Splitting header and getting only token string
    if (!token) return sendErrorRes(res, "Unauthorized request", 401);

    const payload = jwt.verify(token, SECRET_KEY) as { id: string };

    const user = await UserModel.findById(payload.id);
    if (!user) return sendErrorRes(res, "Unauthorized request", 401);

    // Attach user profile inside req object
    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      verified: user.verified,
      avatar: user.avatar?.url,
    };
    next();
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      return sendErrorRes(res, "Session expired", 401);
    }
    if (error instanceof JsonWebTokenError) {
      return sendErrorRes(res, "Unauthorized access", 401);
    }
    next(error);
  }
};

export const isValidPassResetToken: RequestHandler = async (req, res, next) => {
  //Read token and id
  //Find token inside db with owner id
  //If no token send error
  //Else compare token with encrypted value
  //If not matched send error
  //Else call next function
  const { id, token } = req.body;
  const resetPassToken = await PasswordResetTokenModel.findOne({ owner: id });
  if (!resetPassToken)
    return sendErrorRes(res, "Unauthorized request,invalid token", 403);
  const matched = resetPassToken.compareToken(token);
  if (!matched)
    return sendErrorRes(res, "Unauthorized request,invalid token", 403);

  next();
};
