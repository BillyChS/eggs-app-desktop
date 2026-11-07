using EggsApp.Api.Data;
using EggsApp.Api.Features.Customers;
using EggsApp.Api.Features.Expenses;
using EggsApp.Api.Features.Payments;
using EggsApp.Api.Features.Sales;

namespace EggsApp.Api.Features.Reports;

public static class GetSummary
{
    /// <summary>The longest period one summary covers, so a typo in a year can't load everything ever entered.</summary>
    public const int MaxDays = 366;

    /// <summary>How many customers "Mejores clientes" names. The rest are added up in one line.</summary>
    public const int TopCustomers = 10;

    /// <summary>
    /// Puts together what the Ventas, Gastos and Clientes screens already show, by calling their own handlers, so a
    /// number here can never disagree with the same number there.
    /// </summary>
    public static async Task<SummaryResponse> HandleAsync(AppDbContext db, DateOnly from, DateOnly to)
    {
        var sales = await ListSales.HandleAsync(db, from, to);
        var payments = await ListPayments.HandleAsync(db, from, to);
        var expenses = await ListExpenses.HandleAsync(db, from, to);
        var owedTotal = (await ListCustomers.HandleAsync(db, search: null)).OwedTotal;

        var cameIn = new CameIn(sales.CashTotal, payments.Total);

        var byCategory = expenses.Expenses
            .GroupBy(expense => expense.Category.Id)
            .Select(group => new CategorySpent(group.First().Category.Name, group.Sum(expense => expense.Amount)))
            .OrderByDescending(category => category.Total)
            .ThenBy(category => category.Name, CustomerNames.SpanishOrder)
            .ToList();

        var cartons = sales.Sales
            .SelectMany(sale => sale.Items)
            .GroupBy(item => item.CartonType)
            .OrderBy(group => group.Key, StringComparer.Ordinal)
            .Select(group => new CartonsSold(group.Key, group.Sum(item => item.Quantity)))
            .ToList();

        var cameInByDay = sales.Sales
            .Where(sale => !sale.IsCredit)
            .Select(sale => (sale.Date, sale.Total))
            .Concat(payments.Payments.Select(payment => (payment.Date, Total: payment.Amount)))
            .GroupBy(entry => entry.Date)
            .ToDictionary(group => group.Key, group => group.Sum(entry => entry.Total));

        var spentByDay = expenses.Expenses
            .GroupBy(expense => expense.Date)
            .ToDictionary(group => group.Key, group => group.Sum(expense => expense.Amount));

        // A day with only a credit sale still had something happen, so it's listed, at ₡0.
        var days = sales.Sales.Select(sale => sale.Date)
            .Concat(payments.Payments.Select(payment => payment.Date))
            .Concat(expenses.Expenses.Select(expense => expense.Date))
            .Distinct()
            .Order()
            .Select(day => new DaySummary(day, cameInByDay.GetValueOrDefault(day), spentByDay.GetValueOrDefault(day)))
            .ToList();

        return new SummaryResponse(
            from,
            to,
            cameIn,
            new Spent(expenses.Total, byCategory),
            cameIn.Total - expenses.Total,
            sales.CreditTotal,
            owedTotal,
            cartons,
            days,
            RankCustomers(sales));
    }

    /// <summary>From the sales Ventas lists, so it adds up with them: ranked plus without customer is every sale.</summary>
    private static BestCustomers RankCustomers(SaleListResponse sales)
    {
        var ranked = sales.Sales
            .Where(sale => sale.Customer is not null)
            .GroupBy(sale => sale.Customer!.Id)
            .Select(group =>
            {
                var items = group.SelectMany(sale => sale.Items).ToList();
                var customer = group.First().Customer!;

                return new CustomerBought(
                    customer.Id,
                    customer.Name,
                    customer.IsDeleted,
                    items.Where(item => item.CartonType == "A").Sum(item => item.Quantity),
                    items.Where(item => item.CartonType == "B").Sum(item => item.Quantity),
                    group.Sum(sale => sale.Total));
            })
            .OrderByDescending(customer => customer.Total)
            .ThenByDescending(customer => customer.Fifteens + customer.Thirties)
            .ThenBy(customer => customer.Name, CustomerNames.SpanishOrder)
            .ToList();

        var others = ranked.Skip(TopCustomers).ToList();

        return new BestCustomers(
            [.. ranked.Take(TopCustomers)],
            others.Count,
            others.Sum(customer => customer.Total),
            sales.Sales.Where(sale => sale.Customer is null).Sum(sale => sale.Total));
    }
}
