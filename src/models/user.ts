import { Schema, model } from "mongoose";
import { hash, compare, genSalt } from "bcrypt";
import { object } from "yup";
import mongoose from "mongoose";

export interface UserDocument extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password: string;
  verified: boolean;
  token: string[];
  avatar?: { url: string; id: string };
}

interface Methods {
  comparePassword(password: string): Promise<boolean>;
}

const userSchema = new Schema<UserDocument, {}, Methods>(
  {
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    verified: { type: Boolean, default: false },
    token: [String],
    avatar: { type: Object, url: String, id: String },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    const salt = await genSalt(10);
    this.password = await hash(this.password, salt);
  }
  next();
});

userSchema.methods.comparePassword = async function (password) {
  return await compare(password, this.password);
};

const UserModel = model("User", userSchema);
export default UserModel;
