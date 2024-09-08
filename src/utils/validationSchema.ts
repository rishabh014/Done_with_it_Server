import { isValidObjectId } from "mongoose";
import * as yup from "yup";
import categories from "./categories";
import { parseISO, isValid } from "date-fns";

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const passwordRegex =
  /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

yup.addMethod(yup.string, "email", function validateEmail(message) {
  return this.matches(emailRegex, {
    message,
    name: "email",
    excludeEmptyString: true,
  });
});

const password = {
  password: yup
    .string()
    .required("Password is missing")
    .min(8, "Password too small")
    .matches(passwordRegex, "Password is too simple"),
};

export const newUserSchema = yup.object({
  name: yup.string().required("Name is missing"),
  email: yup.string().email("Invalid Email").required("Email is missing"),
  ...password,
});

const tokenAndId = {
  id: yup.string().test({
    name: "valid-id",
    message: "Invalid user ID",
    test: (value) => {
      return isValidObjectId(value);
    },
  }),
  token: yup.string().required("Token is missing"),
};

export const verifyTokenSchema = yup.object({ ...tokenAndId });

export const resetPassSchema = yup.object({
  ...tokenAndId,
  ...password,
});

export const newProductSchema = yup.object({
  name: yup.string().required("Name is missing!"),
  description: yup.string().required("Description is missing"),
  category: yup
    .string()
    .oneOf(categories, "Invalid category")
    .required("Category is missing"),
  price: yup
    .string()
    .transform((value) => {
      if (isNaN(+value)) return "";

      return +value;
    })
    .required("price is missing"),
  // purchasingDate: yup
  //   .date()
  //   .transform((value) => {
  //     try {
  //       return parseISO(value);
  //     } catch (error) {
  //       return "";
  //     }
  //   })
  //   .required("Purchasing date is missing"),
  purchasingDate: yup
    .string()
    .transform((value) => {
      const parsedDate = parseISO(value);
      return isValid(parsedDate) ? parsedDate : undefined;
    })
    .required("Purchasing date is missing")
    .typeError("Purchasing date must be a valid date"),
});
