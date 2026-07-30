from datetime import datetime

from pydantic import BaseModel


class DealOut(BaseModel):
    id: int
    deal_number: str
    customer_id: int
    customer_name: str | None = None
    furthest_stage: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "DealOut":
        data = DealOut.model_validate(obj)
        data.customer_name = obj.customer.name if obj.customer else None
        return data
