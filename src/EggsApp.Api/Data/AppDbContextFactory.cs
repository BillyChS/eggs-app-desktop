using EggsApp.Api.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace EggsApp.Api.Data;

/// <summary>
/// Used only by the "dotnet ef" tools. It points at the dev database so they can never touch eggs.db.
/// </summary>
public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        Directory.CreateDirectory(AppDataPaths.Root);

        var options = new DbContextOptionsBuilder<AppDbContext>();
        AppDbContext.Configure(options, AppDataPaths.DevDatabase);

        return new AppDbContext(options.Options);
    }
}
