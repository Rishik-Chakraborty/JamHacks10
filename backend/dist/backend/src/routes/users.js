"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersRouter = void 0;
/**
 * Users router — create (upsert by wallet) + fetch by wallet.
 *  POST /api/users
 *  GET  /api/users/:wallet
 */
const express_1 = require("express");
const zod_1 = require("zod");
const User_1 = require("../models/User");
const validate_1 = require("../middleware/validate");
const error_1 = require("../middleware/error");
exports.usersRouter = (0, express_1.Router)();
const createUserSchema = zod_1.z.object({
    wallet: zod_1.z.string().min(1),
    username: zod_1.z.string().min(1),
    avatar: zod_1.z.string().optional(),
    bio: zod_1.z.string().optional(),
});
// POST /api/users — upsert by wallet.
exports.usersRouter.post('/', (0, validate_1.validateBody)(createUserSchema), (0, validate_1.asyncHandler)(async (req, res) => {
    const body = req.body;
    const doc = await User_1.UserModel.findOneAndUpdate({ wallet: body.wallet }, {
        $set: { username: body.username, avatar: body.avatar, bio: body.bio },
        $setOnInsert: { wallet: body.wallet },
    }, { new: true, upsert: true, setDefaultsOnInsert: true });
    res.status(201).json((0, User_1.userToDTO)(doc));
}));
// GET /api/users/:wallet
exports.usersRouter.get('/:wallet', (0, validate_1.asyncHandler)(async (req, res) => {
    const doc = await User_1.UserModel.findOne({ wallet: req.params.wallet });
    if (!doc)
        throw new error_1.HttpError(404, 'User not found');
    res.json((0, User_1.userToDTO)(doc));
}));
