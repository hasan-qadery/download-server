import { Request, Response, NextFunction, Router } from "express";
import { Validator } from "../middlewares/validator";
import { authMiddleware } from "../middlewares/auth.middleware";
import { CreateUserDto } from "../dtos/user/create-user.dto";
import { UserService } from "../services/user.service";
import { Resp } from "../utils/response.util";

const userService = new UserService();

const router = Router();

router.post("/create", Validator.body(CreateUserDto), create);

async function create(req: Request, res: Response, next: NextFunction) {
  const createUserData: CreateUserDto = req.body;

  const result = await userService.validateAndCreate(createUserData);
  if (!result.data) {
    return Resp.error({ message: result.message, code: result.code }).send(res);
  }

  return Resp.success({
    data: result.data,
    message: result.message,
    code: result.code,
  }).send(res);
}
