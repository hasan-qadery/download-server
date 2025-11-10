import { ValidationError } from "class-validator";
import { Response } from "express";
import ipaddr from "ipaddr.js";

interface Pagination {
  offset: number;
  limit: number;
  total_count: number;
}

interface SuccessParams {
  data: any;
  message?: string;
  code?: number;
  meta?: any;
  pagination?: Pagination | object;
  info?: any;
}
interface ErrorParams {
  message?: string;
  code?: number;
  meta?: any;
  pagination?: Pagination | object;
  info?: any;
}

export class Resp {
  constructor(
    public data: any,
    public message: string = "Success",
    public code: number = 200,
    public meta: any = "",
    public pagination: Pagination | object,
    public info: any = ""
  ) {}

  static success({
    data,
    message = "Success",
    code = 200,
    meta = "",
    pagination = {},
  }: SuccessParams) {
    return new Resp(data, message, code, meta, pagination);
  }

  static error({
    message = "Success",
    code = 200,
    meta = "",
    info = "",
    pagination = {},
  }: ErrorParams) {
    if (process.env.NODE_ENV == "production") info = "";

    return new Resp(undefined, message, code, meta, pagination, info);
  }

  public serializeValidationErrors() {
    const errors: ValidationError[] = this.meta;

    this.meta = errors.map((err) => {
      return {
        field: err.property,
        reasons: err.constraints,
      };
    });

    return this;
  }

  public send(res: Response) {
    const ip = res.req.ip ? ipaddr.process(res.req.ip).toString() : "";
    let end = +new Date();
    let diff = end - res.reqStartTime;

    console.log(
      `${res.req.method} ${res.req.originalUrl} - ${this.code} ${diff} ms ${ip}`
    );
    res.header("X-Response-Time", `${diff} ms`);
    return res.status(this.code < 0 ? 400 : this.code).json(this);
  }
}
