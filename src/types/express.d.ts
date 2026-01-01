import { ValidatedFile } from "../modules/file/validators/file.validator";

declare global {
  namespace Express {
    interface Request {
      validatedFiles?: ValidatedFile[];
    }
  }
}
