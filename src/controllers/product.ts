import cloudUploader from "src/cloud/index";
import { RequestHandler } from "express";
import ProductModel, { ProductDocument } from "src/models/product";
import { sendErrorRes } from "src/utils/helper";
import { UploadApiResponse } from "cloudinary";
import { FilterQuery, isValidObjectId } from "mongoose";
import { cloudApi } from "src/cloud/index";
import UserModel, { UserDocument } from "src/models/user";
import categories from "src/utils/categories";

const uploadImage = (filePath: string): Promise<UploadApiResponse> => {
  return cloudUploader.upload(filePath, {
    width: 1280,
    height: 720,
    crop: "fill",
  });
};

export const listNewProduct: RequestHandler = async (req, res) => {
  // User must be authenticated
  // Validate incoming data
  // Create product
  // Validate and upload file (files) - note (restrict image qty)
  // Send response back

  const { name, price, category, description, purchasingDate } = req.body;

  // Ensure purchasingDate is a Date object
  const parsedPurchasingDate = new Date(purchasingDate);
  if (isNaN(parsedPurchasingDate.getTime())) {
    return sendErrorRes(res, "Invalid purchasing date format", 422);
  }

  const newProduct = new ProductModel({
    owner: req.user.id,
    name,
    price,
    category,
    description,
    purchasingDate,
  });

  const { images } = req.files;
  let invalidFileType = false;
  const isMultipleImages = Array.isArray(images);

  if (isMultipleImages && images.length > 5) {
    return sendErrorRes(res, "Image files cannot be more than 5!!", 422);
  }

  // Validate file types
  if (isMultipleImages) {
    for (let img of images) {
      if (!img.mimetype?.startsWith("image")) {
        invalidFileType = true;
        break;
      }
    }
  } else {
    if (images) {
      if (!images.mimetype?.startsWith("image")) {
        invalidFileType = true;
      }
    }
  }

  if (invalidFileType) {
    return sendErrorRes(res, "Invalid file type, file must be an image!!", 422);
  }

  // FILE UPLOAD
  if (isMultipleImages) {
    const uploadPromises = images.map((file) => uploadImage(file.filepath));
    // Wait for all file uploads to complete
    const uploadResults = await Promise.all(uploadPromises);
    // Add the image URLs and Public IDs to the product's images field
    newProduct.images = uploadResults.map(({ secure_url, public_id }) => ({
      url: secure_url,
      id: public_id,
    }));
    newProduct.thumbnail = newProduct.images[0].url;
  } else {
    if (images) {
      const { secure_url, public_id } = await uploadImage(images.filepath);
      newProduct.images = [{ url: secure_url, id: public_id }];
      newProduct.thumbnail = secure_url;
    }
  }

  await newProduct.save();
  res.status(201).json({ message: "Added new product!" });
};

export const updateProduct: RequestHandler = async (req, res) => {
  // User must be authenticated
  // User can upload images as well
  // Validate incoming data
  // Update normal properties (if the product is made by the same user)
  // Upload and update images as well (restrict image qty)
  // Send response back

  console.log("req.body ", req.body, "req.files ", req.files);

  const { name, price, category, description, purchasingDate, thumbnail } =
    req.body;
  const productId = req.params.id;

  if (!isValidObjectId(productId)) {
    return sendErrorRes(res, "Invalid product id", 422);
  }

  const product = await ProductModel.findOneAndUpdate(
    {
      _id: productId,
      owner: req.user.id,
    },
    { name, price, category, description, purchasingDate, thumbnail },
    { new: true }
  );

  if (!product) {
    return sendErrorRes(res, "Product not found", 404);
  }

  if (typeof thumbnail === "string") product.thumbnail = thumbnail;

  const { images } = req.files;
  const isMultipleImages = Array.isArray(images);

  if (isMultipleImages) {
    const oldImages = product.images?.length || 0;
    if (oldImages + images.length > 5) {
      return sendErrorRes(res, "Image files cannot be more than 5", 422);
    }
  }

  let invalidFileType = false;

  if (isMultipleImages) {
    for (let img of images) {
      if (!img.mimetype?.startsWith("image")) {
        invalidFileType = true;
        break;
      }
    }
  } else {
    if (images) {
      if (!images.mimetype?.startsWith("image")) {
        invalidFileType = true;
      }
    }
  }

  if (invalidFileType) {
    return sendErrorRes(res, "Invalid file type, file must be an image!!", 422);
  }

  // FILE UPLOAD
  if (isMultipleImages) {
    const uploadPromises = images.map((file) => uploadImage(file.filepath));
    // Wait for all file uploads to complete
    const uploadResults = await Promise.all(uploadPromises);
    // Add the image URLs and Public IDs to the product's images field
    const newImages = uploadResults.map(({ secure_url, public_id }) => ({
      url: secure_url,
      id: public_id,
    }));
    if (product.images) product.images.push(...newImages);
    else product.images = newImages;
  } else {
    if (images) {
      const { secure_url, public_id } = await uploadImage(images.filepath);
      if (product.images)
        product.images.push({ url: secure_url, id: public_id });
      else product.images = [{ url: secure_url, id: public_id }];
    }
  }

  await product.save();
  res.status(200).json({ message: "Product updated successfully!" });
};

export const deleteProduct: RequestHandler = async (req, res) => {
  // User must be authenticated
  // Validate the product id
  // remove if it is made by the same user
  // Remove images as well
  // Send the response back

  const productId = req.params.id;

  if (!isValidObjectId(productId)) {
    return sendErrorRes(res, "Invalid product id", 422);
  }

  const product = await ProductModel.findOneAndDelete({
    _id: productId,
    owner: req.user.id,
  });

  if (!product) {
    return sendErrorRes(res, "Product not found", 404);
  }

  const images = product.images;

  if (images && Array.isArray(images) && images.length > 0) {
    const ids = images.map(({ id }) => id);
    if (ids.length > 0) {
      await cloudApi.delete_all_resources(ids);
    }
  }

  res.status(200).json({ message: "Product removed successfully!" });
};

export const deleteProductImage: RequestHandler = async (req, res) => {
  const { productId, imageId } = req.params;

  if (!isValidObjectId(productId)) {
    return sendErrorRes(res, "Invalid product id", 422);
  }

  // Find the product to check the original image count
  const product = await ProductModel.findOne({
    _id: productId,
    owner: req.user.id,
  });

  if (!product) {
    return sendErrorRes(res, "Product not found", 404);
  }

  // Check if the imageId exists in the product's images array
  const imageExists = product.images?.some((image) => image.id === imageId);
  console.log(
    `Image ID ${imageId} ${
      imageExists ? "found" : "not found"
    } in product images`
  );

  const originalImageCount = product.images?.length || 0;

  // Update the product and remove the specified image
  const updatedProduct = await ProductModel.findOneAndUpdate(
    { _id: productId, owner: req.user.id },
    { $pull: { images: { id: imageId } } },
    { new: true }
  );

  if (!updatedProduct) {
    return sendErrorRes(res, "Product not found", 404);
  }

  // Safely check the updated image count
  const updatedImageCount = updatedProduct.images
    ? updatedProduct.images.length
    : 0;

  if (originalImageCount === updatedImageCount) {
    return sendErrorRes(res, "Image not found", 404);
  }

  // Check if the removed image was the thumbnail
  if (updatedProduct.thumbnail?.includes(imageId)) {
    const firstImage =
      updatedProduct.images && updatedProduct.images.length > 0
        ? updatedProduct.images[0].url
        : "";
    updatedProduct.thumbnail = firstImage;
    await updatedProduct.save();
  }

  // Remove the image from cloud storage
  await cloudUploader.destroy(imageId);

  res.json({ message: "Image removed successfully" });
};

export const getProductDetail: RequestHandler = async (req, res) => {
  // User must be authenticated (optional)
  // Validate the product Id
  // Find the Product by the id
  // Format data
  // Send the response back

  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return sendErrorRes(res, "Invalid product id", 422);
  }

  const product = await ProductModel.findById(id).populate<{
    owner: UserDocument;
  }>("owner");

  if (!product) {
    return sendErrorRes(res, "Product not found", 404);
  }

  res.json({
    product: {
      id: product._id,
      name: product.name,
      description: product.description,
      thumbnail: product.thumbnail,
      category: product.category,
      date: product.purchasingDate,
      price: product.price,
      image: product.images?.map(({ url }) => url),
      seller: {
        id: product.owner._id, // Use _id instead of id
        name: product.owner.name,
        avatar: product.owner.avatar?.url,
      },
    },
  });
};

export const getProductsByCategory: RequestHandler = async (req, res) => {
  // User must be authenticated (optional)
  // Validate the category
  // Find the Product by the category(apply pagination if needed)
  // Format data
  // Send the response back
  const { category } = req.params;
  const { pageNo = "1", limit = "10" } = req.query as {
    pageNo: string;
    limit: string;
  };

  if (!categories.includes(category))
    return sendErrorRes(res, "Invalid category", 422);

  const products = await ProductModel.find({ category })
    .sort("-createdAt")
    .skip((+pageNo - 1) * +limit)
    .limit(+limit);

  const listings = products.map((p) => {
    return {
      id: p._id,
      name: p.name,
      thumbnail: p.thumbnail,
      category: p.category,
      price: p.price,
    };
  });

  res.json({ products: listings });
};

// export const getProductsByCategory: RequestHandler = async (req, res) => {
//   console.log("Route hit: /by-category/:category");
//   const { category } = req.params;
//   const { pageNo = "1", limit = "10" } = req.query as {
//     pageNo: string;
//     limit: string;
//   };

//   console.log(`Category: ${category}, Page: ${pageNo}, Limit: ${limit}`);

//   // Validate category
//   if (!categories.includes(category)) {
//     console.error("Invalid category:", category);
//     return sendErrorRes(res, "Invalid category", 422);
//   }

//   try {
//     const products = await ProductModel.find({ category })
//       .sort("-createdAt")
//       .skip((+pageNo - 1) * +limit)
//       .limit(+limit);

//     const listings = products.map((p) => ({
//       id: p._id,
//       name: p.name,
//       thumbnail: p.thumbnail,
//       category: p.category,
//       price: p.price,
//     }));

//     if (listings.length === 0) {
//       console.warn("No products found for category:", category);
//       return sendErrorRes(res, "No products found", 404);
//     }

//     res.json({ products: listings });
//   } catch (error) {
//     console.error("Error fetching products:", error);
//     sendErrorRes(res, "Server error", 500);
//   }
// };

export const getLatestProducts: RequestHandler = async (req, res) => {
  // User must be authenticated (optional)
  //  Find all the products with sorted date (apply limit/pagination if needed)
  //  Format data
  // Send response back

  const products = await ProductModel.find().sort("-createdAt").limit(10);

  const listings = products.map((p) => {
    return {
      id: p._id,
      name: p.name,
      thumbnail: p.thumbnail,
      category: p.category,
      price: p.price,
    };
  });

  res.json({ products: listings });
};

export const getListings: RequestHandler = async (req, res) => {
  //User must be authenticated
  //Find all the product created by this user (apply pagination if needed)
  //Format data
  //Send the response back

  const { pageNo = "1", limit = "10" } = req.query as {
    pageNo: string;
    limit: string;
  };

  const products = await ProductModel.find({ owner: req.user.id })
    .sort("-createdAt")
    .skip((+pageNo - 1) * +limit)
    .limit(+limit);

  const listings = products.map((p) => {
    return {
      id: p._id,
      name: p.name,
      thumbnail: p.thumbnail,
      category: p.category,
      price: p.price,
      date: p.purchasingDate,
      image: p.images?.map((i) => i.url),
      description: p.description,
      seller: {
        id: req.user.id,
        name: req.user.name,
        avatar: req.user.avatar,
      },
    };
  });

  res.json({ products: listings });
};

export const searchProducts: RequestHandler = async (req, res) => {
  const { name } = req.query;

  const filter: FilterQuery<ProductDocument> = {};

  if (typeof name === "string") filter.name = { $regex: new RegExp(name, "i") };

  const products = await ProductModel.find(filter).limit(50);

  res.json({
    results: products.map((product) => ({
      id: product._id,
      name: product.name,
      thumbnail: product.thumbnail,
    })),
  });
};
