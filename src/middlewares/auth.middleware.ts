import { Request, Response, NextFunction } from "express";
import { Resp } from "../utils/response.util";
import { UserService } from "../services/user.service";
// import { LoginService } from "../services/login.service";
// import { LoginModel } from "../models/login.model";
// import { AuthTokenTypeEnum } from "../enums/auth/auth-token-type.enum";

// const authService = new AuthService();
const userService = new UserService();
// const loginService = new LoginService();

declare global {
  namespace Express {
    interface Request {
      user: UserModel;
      // login: LoginModel;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authorization = req.headers.authorization;
  if (!authorization)
    return Resp.error(req.t("AuthErrEnum.NO_TOKEN_PROVIDED"), 401).send(res);

  const token = authorization.split(" ")[1];
  if (!token) {
    return Resp.error(req.t("AuthErrEnum.NO_TOKEN_PROVIDED"), 401).send(res);
  }

  let payload;
  try {
    payload = await authService.decodeAccessToken(
      token,
      AuthTokenTypeEnum.ACCESS
    );

    //TODO: after 60 day change here to only allow tokens with the type of access.
    if (payload.tokenType === AuthTokenTypeEnum.REFRESH) {
      return Resp.error(req.t("AuthErrEnum.INVALID_TOKEN"), 401).send(res);
    }
  } catch (err) {
    return Resp.error(req.t("AuthErrEnum.INVALID_TOKEN"), 401).send(res);
  }

  let login = await loginService.findById(payload.id);

  if (!login) {
    return Resp.error(req.t("AuthErrEnum.INVALID_TOKEN"), 401).send(res);
  }

  let user = await userService.findWithRelations(login.user_id);

  if (!user) {
    return Resp.error(req.t("AuthErrEnum.NO_USER_WITH_THIS_ID"), 401).send(res);
  }

  if (user.is_banned) {
    return Resp.error(req.t("UserErrorEnum.BANNED"), 403).send(res);
  }

  req.login = login;
  req.user = user;

  next();
}
