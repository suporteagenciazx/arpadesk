from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_admin_finance, user_has_project_access
from app.models import Expense, User, UserLevel
from app.schemas import ExpenseCreate, ExpenseOut, ExpenseUpdate

router = APIRouter(prefix="/api/projects/{project_id}/expenses", tags=["expenses"])


def normalize_expense_amount(value: float) -> float:
    return -abs(float(value))


@router.get("", response_model=list[ExpenseOut])
def list_expenses(
    project_id: int,
    period_start: str | None = Query(None),
    period_end: str | None = Query(None),
    user: User = Depends(require_admin_finance),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    items_q = db.query(Expense).filter(Expense.project_id == project_id)
    if period_start:
        items_q = items_q.filter(Expense.expense_date >= date.fromisoformat(period_start))
    if period_end:
        items_q = items_q.filter(Expense.expense_date <= date.fromisoformat(period_end))
    items = items_q.order_by(Expense.expense_date.desc()).all()
    return [
        ExpenseOut(
            id=e.id,
            expense_type=e.expense_type,
            amount=float(e.amount),
            notes=e.notes,
            expense_date=e.expense_date,
            created_at=e.created_at,
        )
        for e in items
    ]


@router.post("", response_model=ExpenseOut, status_code=201)
def create_expense(
    project_id: int,
    data: ExpenseCreate,
    user: User = Depends(require_admin_finance),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    expense = Expense(
        project_id=project_id,
        expense_type=data.expense_type,
        amount=normalize_expense_amount(data.amount),
        notes=data.notes,
        expense_date=data.expense_date or date.today(),
        created_by_id=user.id,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return ExpenseOut(
        id=expense.id,
        expense_type=expense.expense_type,
        amount=float(expense.amount),
        notes=expense.notes,
        expense_date=expense.expense_date,
        created_at=expense.created_at,
    )


@router.patch("/{expense_id}", response_model=ExpenseOut)
def update_expense(
    project_id: int,
    expense_id: int,
    data: ExpenseUpdate,
    user: User = Depends(require_admin_finance),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    expense = db.query(Expense).filter(Expense.id == expense_id, Expense.project_id == project_id).first()
    if not expense:
        raise HTTPException(404, "Despesa não encontrada")
    if data.expense_type is not None:
        expense.expense_type = data.expense_type
    if data.amount is not None:
        expense.amount = normalize_expense_amount(data.amount)
    if data.notes is not None:
        expense.notes = data.notes
    if data.expense_date is not None:
        expense.expense_date = data.expense_date
    db.commit()
    db.refresh(expense)
    return ExpenseOut(
        id=expense.id,
        expense_type=expense.expense_type,
        amount=float(expense.amount),
        notes=expense.notes,
        expense_date=expense.expense_date,
        created_at=expense.created_at,
    )


@router.delete("/{expense_id}", status_code=204)
def delete_expense(
    project_id: int,
    expense_id: int,
    user: User = Depends(require_admin_finance),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    expense = db.query(Expense).filter(Expense.id == expense_id, Expense.project_id == project_id).first()
    if not expense:
        raise HTTPException(404, "Despesa não encontrada")
    db.delete(expense)
    db.commit()
