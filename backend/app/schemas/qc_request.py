from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.validators import not_in_future


class QcRequestCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    production_order_id: int = Field(gt=0)
    production_execution_id: int = Field(gt=0)
    qc_agent_id: int = Field(gt=0)
    # How much of the execution's produced_quantity this request will
    # decide -- distinct from sample_quantity below (the much smaller
    # physical sample sent to the lab). Omit to default to whatever's
    # still undecided on the execution (see qc_service.create_request);
    # give it explicitly to split one execution's output across more
    # than one QC request (P8 spec section 5's partial accept/reject).
    quantity: float | None = Field(default=None, gt=0)
    sample_quantity: float | None = Field(default=None, gt=0)
    expected_report_date: date | None = None
    notes: str | None = Field(default=None, max_length=5000)


class QcSampleSentUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    dispatch_method: str | None = Field(default=None, max_length=120)
    external_reference: str | None = Field(default=None, max_length=80)


class QcReportRecord(BaseModel):
    """Records the external report itself -- report_number/report_date
    are write-once (see QcRequest's own docstring). `result`, when
    given, decides the request in this same call (a report that already
    states its conclusion); omitted, the request just moves to
    'report_received' and a later QcResultRecord call finishes it (spec
    section 4/6's "report received without a conclusion yet")."""

    model_config = ConfigDict(str_strip_whitespace=True)

    report_number: str = Field(min_length=1, max_length=60)
    report_date: date
    remarks: str | None = Field(default=None, max_length=5000)
    result: str | None = Field(default=None, pattern="^(accepted|rejected)$")

    @field_validator("report_date")
    @classmethod
    def _report_date_not_future(cls, v: date) -> date:
        return not_in_future(v)


class QcResultRecord(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    result: str = Field(pattern="^(accepted|rejected)$")
    # Required when result == 'rejected' (enforced in qc_service.record_result,
    # not here, since the requirement depends on another field's value).
    remarks: str | None = Field(default=None, max_length=5000)


class QcAdminReview(BaseModel):
    notes: str = Field(min_length=1, max_length=5000)


class QcRequestOut(BaseModel):
    id: int
    qc_request_number: str
    production_order_id: int
    production_order_number: str | None = None
    production_execution_id: int
    product_id: int
    product_code: str | None = None
    product_name: str | None = None
    qc_agent_id: int
    qc_agent_name: str | None = None
    sample_reference: str
    quantity: float
    sample_quantity: float | None
    request_date: date
    expected_report_date: date | None
    status: str
    dispatch_date: date | None
    dispatch_method: str | None
    external_reference: str | None
    dispatched_by: int | None
    report_number: str | None
    report_date: date | None
    received_date: date | None
    decided_date: date | None
    decided_by: int | None
    notes: str | None
    has_report_document: bool = False
    admin_review_required: bool
    admin_reviewed_at: datetime | None
    admin_review_notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "QcRequestOut":
        data = QcRequestOut.model_validate(obj)
        data.production_order_number = obj.production_order.production_order_number if obj.production_order else None
        data.product_code = obj.product.code if obj.product else None
        data.product_name = obj.product.name if obj.product else None
        data.qc_agent_name = obj.qc_agent.name if obj.qc_agent else None
        data.has_report_document = bool(obj.id_document_filename)
        return data
