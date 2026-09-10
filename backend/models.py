from typing import Optional, List
from pydantic import BaseModel, Field


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    business_name: str = Field(min_length=2, max_length=120)
    primary_trade: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=5, max_length=30)
    terms_accepted: bool
    terms_version: str = Field(min_length=1, max_length=20)


class LoginIn(BaseModel):
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=1, max_length=128)


class ForgotIn(BaseModel):
    email: str = Field(min_length=5, max_length=120)


class ResetIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=8, max_length=128)


class LineItemIn(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    qty: float = Field(ge=0, le=100000)
    unit_price: float = Field(ge=0, le=10000000)


class DocIn(BaseModel):
    customer_name: str = Field(min_length=1, max_length=120)
    customer_email: str = Field(default="", max_length=120)
    customer_phone: str = Field(default="", max_length=40)
    customer_address: str = Field(default="", max_length=300)
    job_description: str = Field(default="", max_length=2000)
    issue_date: str = Field(min_length=8, max_length=10)
    expiry_date: Optional[str] = Field(default=None, max_length=10)
    due_date: Optional[str] = Field(default=None, max_length=10)
    tax_rate: float = Field(default=0, ge=0, le=100)
    status: str = Field(default="draft", max_length=20)
    notes: str = Field(default="", max_length=2000)
    items: List[LineItemIn] = Field(default_factory=list, max_length=100)
    source_request_id: Optional[str] = None


class BusinessIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    business_name: str = Field(min_length=2, max_length=120)
    primary_trade: str = Field(min_length=2, max_length=80)
    address: str = Field(default="", max_length=300)
    phone: str = Field(min_length=5, max_length=30)
    email: str = Field(min_length=5, max_length=120)
    license: str = Field(default="", max_length=80)
    default_tax_rate: float = Field(default=0, ge=0, le=100)
    default_labor_rate: float = Field(default=0, ge=0, le=100000)


class ProfileIn(BaseModel):
    display_name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=2000)
    is_public: bool = False


class CaptionIn(BaseModel):
    caption: str = Field(default="", max_length=200)


class ReorderIn(BaseModel):
    order: List[str] = Field(default_factory=list, max_length=50)


class RequestStatusIn(BaseModel):
    status: str = Field(min_length=2, max_length=20)


class CouponValidateIn(BaseModel):
    code: str = Field(min_length=2, max_length=40)


class UpgradeIn(BaseModel):
    coupon_code: Optional[str] = Field(default=None, max_length=40)


class TradeIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    active: bool = True


class CouponIn(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    type: str = Field(pattern="^(percent|fixed)$")
    value: float = Field(gt=0, le=100000)
    start_date: Optional[str] = Field(default=None, max_length=10)
    end_date: Optional[str] = Field(default=None, max_length=10)
    max_redemptions: int = Field(default=100, ge=1, le=1000000)
    active: bool = True


class WatermarkIn(BaseModel):
    enabled: bool = True
    text: str = Field(default="Created with Quote Flow Free", max_length=120)
    size: int = Field(default=44, ge=10, le=120)
    opacity: float = Field(default=0.12, ge=0.02, le=1.0)
    position: str = Field(default="center", pattern="^(center|footer)$")


class PlatformSettingsIn(BaseModel):
    plan_price: float = Field(gt=0, le=100000)
    free_quote_limit: int = Field(ge=0, le=10000)
    free_invoice_limit: int = Field(ge=0, le=10000)
    max_request_images: int = Field(ge=0, le=10)
    max_portfolio_images: int = Field(ge=1, le=30)
    image_max_mb: int = Field(ge=1, le=25)
    image_max_dimension: int = Field(ge=200, le=8000)
    image_allowed_types: List[str] = Field(default_factory=list, max_length=10)
    support_phone: str = Field(default="", max_length=30)


class TermsIn(BaseModel):
    version: str = Field(min_length=1, max_length=20)
    content: str = Field(min_length=10, max_length=50000)


class AdminUserIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    status: Optional[str] = Field(default=None, pattern="^(active|suspended)$")
    role: Optional[str] = Field(default=None, pattern="^(admin|pro|customer)$")
    plan: Optional[str] = Field(default=None, pattern="^(free|pro)$")


class AdminProfessionalIn(BaseModel):
    business_name: Optional[str] = Field(default=None, max_length=120)
    primary_trade: Optional[str] = Field(default=None, max_length=80)
    phone: Optional[str] = Field(default=None, max_length=30)
    email: Optional[str] = Field(default=None, max_length=120)
    address: Optional[str] = Field(default=None, max_length=300)
    license: Optional[str] = Field(default=None, max_length=80)
    description: Optional[str] = Field(default=None, max_length=2000)
