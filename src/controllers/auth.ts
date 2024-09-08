import { RequestHandler } from "express";
import UserModel from "src/models/user";
import crypto from "crypto";
import AuthVerificationTokenModel from "src/models/authVerificationToken";
import { sendErrorRes } from "src/utils/helper";
import jwt, { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import mail from "src/utils/mail";
import PasswordResetTokenModel from "src/models/passwordResetToken";
import { isValidObjectId } from "mongoose";
import cloudUploader from "src/cloud/index";

const VERIFICATION_LINK = process.env.VERIFICATION_LINK;
const PASSWORD_RESET_LINK = process.env.PASSWORD_RESET_LINK;
const SECRET_KEY = process.env.SECRET_KEY!;

//CLOUD

export const createNewUser: RequestHandler = async (req, res, next) => {
  try {
    // Read incoming data like name, email, and password
    const { name, email, password } = req.body;

    // Validate if the data is ok or not
    if (!name) return sendErrorRes(res, "Name is missing", 422);
    if (!email) return sendErrorRes(res, "Email is missing", 422);
    if (!password) return sendErrorRes(res, "Password is missing", 422);

    // Check if user already exists
    const existingUser = await UserModel.findOne({ email });

    // Send error if user exists
    if (existingUser) {
      return sendErrorRes(res, "Email already in use", 401);
    }

    // Create a new user instance and save it to the database
    const newUser = await UserModel.create({ name, email, password });

    // Generate and store verification token
    const token = crypto.randomBytes(36).toString("hex");
    await AuthVerificationTokenModel.create({ owner: newUser._id, token });

    // Create verification link
    const link = `${VERIFICATION_LINK}?id=${newUser._id}&token=${token}`;

    // Send verification link and token to register email
    await mail.sendVerification(newUser.email, link);

    // Respond with success message and user data
    return res.status(201).json({
      message:
        "User created successfully. Please check your inbox for verification.",
      user: newUser,
    });
  } catch (error) {
    // Pass any unexpected errors to the next error handler
    next(error);
  }
};
export const verifyEmail: RequestHandler = async (req, res) => {
  //Reading data id and token
  const { id, token } = req.body;
  //Finding the token inside DB (using owner id)
  const authToken = await AuthVerificationTokenModel.findOne({ owner: id });
  //Send error if token not found
  if (!authToken) return sendErrorRes(res, "Unauthorized request!", 403);
  //Check if the token is valid or not (because we have encrypted value)
  const isMatched = await authToken.compareToken(token);
  //Send error message if not valid, otherwise update user is verified
  if (!isMatched)
    return sendErrorRes(res, "Unauthorized request, invalid token!", 403);
  await UserModel.findByIdAndUpdate(id, { verified: true });
  //Remove token from DB
  await AuthVerificationTokenModel.findByIdAndDelete(authToken._id);
  //Send success message
  return res.json({
    message: "Thanks for joining us your email is verified successfully",
  });
};
export const signIn: RequestHandler = async (req, res) => {
  //Read incoming data email & password
  const { email, password } = req.body;
  //Find user by email
  const user = await UserModel.findOne({ email });
  //Send error if user not found
  if (!user) return sendErrorRes(res, "Email/Password does not match!", 403);
  //Check if the password is valid or not (because password is in encrypted form)
  const isMatched = await user.comparePassword(password);
  if (!isMatched) return sendErrorRes(res, "Password does not match!", 403);
  //If matched generate access and refresh tokens
  const payload = { id: user._id };
  const accessToken = jwt.sign(payload, SECRET_KEY, { expiresIn: "15m" });
  const refreshToken = jwt.sign(payload, SECRET_KEY);

  if (!user.token) user.token = [refreshToken];
  else user.token.push(refreshToken);
  //saving updated token details in user db
  await user.save();
  //Send both token to user
  res.json({
    profile: {
      id: user._id,
      email: user.email,
      name: user.name,
      verified: user.verified,
      avatar: user.avatar?.url,
    },
    token: { refresh: refreshToken, access: accessToken },
  });
};
export const sendProfile: RequestHandler = async (req, res) => {
  res.json({
    profile: req.user,
  });
};
export const generateVerificationLink: RequestHandler = async (req, res) => {
  //1.Check if user is authenticated or not
  //2. remove previous token if any
  //3. create/store new token
  //4. send link inside users email
  //5.send response back
  const { id } = req.user;
  const token = crypto.randomBytes(36).toString("hex");

  const link = `${VERIFICATION_LINK}?id=${id}&token=${token}`;

  await AuthVerificationTokenModel.findOneAndDelete({
    owner: id,
  });

  await AuthVerificationTokenModel.create({ owner: id, token });
  await mail.sendVerification(req.user.email, link);
  res.json({ message: "Please check your inbox" });
};

export const grantAccessToken: RequestHandler = async (req, res, next) => {
  //read and verify refresh token
  const { refreshToken } = req.body;
  if (!refreshToken) return sendErrorRes(res, "Unauthorized request", 403);
  //Find user with payload id and refresh token
  const payload = jwt.verify(refreshToken, SECRET_KEY) as { id: string };
  if (!payload.id) return sendErrorRes(res, "Unauthorized request", 401);

  const user = await UserModel.findOne({
    _id: payload.id,
    token: refreshToken,
  });
  if (!user) {
    //user is compromised,remove all previous token
    // await UserModel.findOneAndUpdate(payload.id, { token: [] });
    await UserModel.findOneAndUpdate({ _id: payload.id }, { token: [] });
    return sendErrorRes(res, "Unauthorized request", 401);
  }
  //IF THE TOKEN IS VALID AND USER IS FOUND CREATE NEW REFRESH AND ACCESS TOKEN
  //REMOVE PREVIOUS TOKEN, UPDATE USER AND SEND NEW TOKEN
  const newAccessToken = jwt.sign({ id: user._id }, SECRET_KEY, {
    expiresIn: "15m",
  });
  const newRefreshToken = jwt.sign({ id: user._id }, SECRET_KEY);
  // const filteredTokens = user.token.filter((t) => t !== refreshToken);
  // user.token = filteredTokens;
  // user.token.push(newRefreshToken);
  // await user.save();

  // Update the user's token array to only include the new refresh token
  user.token = [newRefreshToken];
  await user.save();

  res.json({
    profile: {
      id: user._id,
      email: user.email,
      name: user.name,
      verified: user.verified,
      avatar: user.avatar?.url,
    },
    token: { refresh: newRefreshToken, access: newAccessToken },
  });
};

export const signOut: RequestHandler = async (req, res) => {
  //To sign-out remove the refresh token

  const { refreshToken } = req.body;

  console.log("Received refreshToken:", refreshToken);
  console.log("Request user:", req.user);

  if (!refreshToken) {
    return sendErrorRes(res, "Unauthorized request, refreshToken missing", 403);
  }

  try {
    const user = await UserModel.findOne({
      _id: req.user.id,
      token: refreshToken,
    });

    console.log("Found user:", user);

    if (!user) {
      console.log("User not found or refresh token does not match.");
      return sendErrorRes(res, "Unauthorized request, user not found", 403);
    }

    user.token = user.token.filter((t) => t !== refreshToken);
    await user.save();

    console.log("Updated user tokens:", user.token);

    res.send({ message: "Signed out successfully" });
  } catch (error) {
    console.error("Error in signOut:", error);
    sendErrorRes(res, "Internal Server Error", 500);
  }
};

export const generateForgetPasswordLink: RequestHandler = async (req, res) => {
  //Ask for user Email
  //Find user with the given Email
  //Send error if no user
  //Else generate password reset token (first remove if there is any)
  //Generate reset link(like we did for verification)
  //Send link inside user's email
  //Send response back
  const { email } = req.body;
  const user = await UserModel.findOne({ email });
  if (!user) return sendErrorRes(res, "Account not found", 404);

  //Remove Token
  await PasswordResetTokenModel.findOneAndDelete({ owner: user._id });
  //Create new token
  const token = crypto.randomBytes(36).toString("hex");
  await PasswordResetTokenModel.create({ owner: user._id, token });
  //send the link to user's email
  const passResetLink = `${PASSWORD_RESET_LINK}?id=${user._id}&token=${token}`;
  await mail.sendPasswordResetLink(user.email, passResetLink);
  //send response back
  res.send({ message: "Password reset link sent to your email" });
};

export const grantValid: RequestHandler = async (req, res) => {
  res.json({ valid: true });
};

export const updatePassword: RequestHandler = async (req, res) => {
  //1. Read user id, reset pass token and password
  //2. Validate all these things
  //3. If valid find user with given ID
  //4. Check if user is using same password
  //5. If there is no user or user is using the same password (user entered same password to update old one) send error res
  //6. Else update new password
  //7. Remove password reset token
  //8. Send confirmation Email
  //9. Send response back
  const { id, password } = req.body;
  const user = await UserModel.findById(id);

  if (!user) return sendErrorRes(res, "User not found", 404);
  const matched = await user.comparePassword(password);

  if (matched)
    return sendErrorRes(res, "The password you entered must be different", 422);

  user.password = password;
  await user.save();

  await PasswordResetTokenModel.findOneAndDelete({ owner: user._id });

  await mail.sendPasswordUpdateMessage(user.email);
  res.json({ message: "Password reset successfully." });
};

export const updateProfile: RequestHandler = async (req, res) => {
  //1. user must be logged in (authenticated)
  //2. Name must be valid
  //3. Find user and update the same
  //4. Send new profile back

  const { name } = req.body;
  if (typeof name != "string" || name.trim().length < 3) {
    sendErrorRes(res, "Inavlid name sir", 422);
  } else {
    await UserModel.findByIdAndUpdate(req.user.id, { name });

    res.json({ profile: { ...req.user, name } });
  }
};

// export const updateAvatar: RequestHandler = async (req, res) => {
//   //1. user must be logged in (authenticated)
//   //2. Read incoming file
//   //3. File type must be image
//   //4. Check if user already have avatar or not
//   //5. IF yes remove the old avatar
//   //6. Upload new avatar and update user
//   //7. Send response back
//   const { avatar } = req.files;
//   if (Array.isArray(avatar)) {
//     return sendErrorRes(res, "Multiple files are not allowed!", 422);
//   }
//   if (!avatar.mimetype?.startsWith("image")) {
//     return sendErrorRes(res, "Invalid image file type!", 422);
//   }
//   const user = await UserModel.findById(req.user.id);
//   if (!user) {
//     return sendErrorRes(res, "User not found!", 404);
//   }
//   if (user.avatar?.id) {
//     //remove avatar file
//     await cloudUploader.destroy(user.avatar.id);
//   }
//   //upload avatar file
//   const { secure_url: url, public_id: id } = await cloudUploader.upload(
//     avatar.filepath,
//     { width: 300, height: 300, crop: "thumb", gravity: "face" }
//   );
//   user.avatar = { url, id };
//   await user.save();

//   res.json({ profile: { ...req.user, avatar: user.avatar.url } });
// };

export const updateAvatar: RequestHandler = async (req, res) => {
  try {
    // 1. Check if the user is authenticated
    if (!req.user) {
      return sendErrorRes(res, "User is not authenticated!", 401);
    }

    // 2. Validate that the avatar file is present
    if (!req.files || !req.files.avatar) {
      return sendErrorRes(res, "No avatar file uploaded!", 400);
    }

    const { avatar } = req.files;

    // 3. Prevent multiple files from being uploaded
    if (Array.isArray(avatar)) {
      return sendErrorRes(res, "Multiple files are not allowed!", 422);
    }

    // 4. Validate that the uploaded file is an image
    if (!avatar.mimetype?.startsWith("image")) {
      return sendErrorRes(res, "Invalid image file type!", 422);
    }

    // 5. Find the user in the database
    const user = await UserModel.findById(req.user.id);
    if (!user) {
      return sendErrorRes(res, "User not found!", 404);
    }

    // 6. If the user already has an avatar, remove the old avatar
    if (user.avatar?.id) {
      try {
        await cloudUploader.destroy(user.avatar.id);
      } catch (error) {
        console.error("Failed to delete old avatar:", error);
        return sendErrorRes(res, "Failed to delete old avatar", 500);
      }
    }

    // 7. Upload the new avatar
    let uploadedAvatar;
    try {
      uploadedAvatar = await cloudUploader.upload(avatar.filepath, {
        width: 300,
        height: 300,
        crop: "thumb",
        gravity: "face",
      });
    } catch (error) {
      console.error("Avatar upload failed:", error);
      return sendErrorRes(res, "Failed to upload avatar", 500);
    }

    const { secure_url: url, public_id: id } = uploadedAvatar;

    // 8. Update the user's avatar information
    user.avatar = { url, id };
    await user.save();

    // 9. Send the updated profile information back to the client
    res.json({ profile: { ...req.user, avatar: user.avatar.url } });
  } catch (error) {
    console.error("Unexpected error in updateAvatar:", error);
    sendErrorRes(res, "Unexpected error occurred", 500);
  }
};

export const sendPublicProfile: RequestHandler = async (req, res) => {
  const profileId = req.params.id;
  if (!isValidObjectId(profileId)) {
    return sendErrorRes(res, "Invalid profile id!", 422);
  }

  const user = await UserModel.findById(profileId);
  if (!user) {
    return sendErrorRes(res, "Profile not found!", 404);
  }

  res.json({
    profile: { id: user._id, name: user.name, avatar: user.avatar?.url },
  });
};
