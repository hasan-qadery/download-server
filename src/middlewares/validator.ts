import { validate } from "class-validator";
import { plainToClass, plainToClassFromExist } from "class-transformer";
import { Request, Response, NextFunction } from "express";
import { Resp } from "../utils/response.util";

export class Validator {
  static body(Schema: any) {
    return (req: Request, res: Response, next: NextFunction) => {
      const body = plainToClassFromExist(new Schema(), req.body);

      validate(body, { whitelist: true, forbidNonWhitelisted: true }).then(
        (errors) => {
          if (!errors.length) {
            req.body = body;
            return next();
          }

          const resp = Resp.error({
            message: "ValidationErrEnum.BODY_FAILED",
            code: 400,
            meta: errors,
          });
          return next(resp.serializeValidationErrors());
        }
      );
    };
  }

  static query(Schema: any) {
    return (req: Request, res: Response, next: NextFunction) => {
      const query = plainToClassFromExist(new Schema(), req.query);

      validate(query, { whitelist: true, forbidNonWhitelisted: true }).then(
        (errors) => {
          if (!errors.length) {
            req.query = query;
            return next();
          }

          const resp = Resp.error({
            message: "ValidationErrEnum.QUERY_FAILED",
            code: 400,
            meta: errors,
          });
          return next(resp.serializeValidationErrors().send(res));
        }
      );
    };
  }

  static params(Schema: any) {
    return (req: Request, res: Response, next: NextFunction) => {
      const params = plainToClassFromExist(new Schema(), req.params);
      validate(params, { whitelist: true, forbidNonWhitelisted: true }).then(
        (errors) => {
          if (!errors.length) {
            req.params = params;
            return next();
          }

          const resp = Resp.error({
            message: "ValidationErrEnum.PARAM_FAILED",
            code: 400,
            meta: errors,
          });
          return next(resp.serializeValidationErrors().send(res));
        }
      );
    };
  }
}
