using System.Windows;
using System.Windows.Threading;
using EggsApp.Api.Data;
using EggsApp.Api.Hosting;
using Microsoft.Web.WebView2.Core;

namespace EggsApp.Desktop;

public partial class App : Application
{
    private const string LogSource = "Desktop";

    // The API's own 5 seconds, plus the backup made on closing. The window is already gone by then.
    private static readonly TimeSpan HostStopTimeout = TimeSpan.FromSeconds(10);

    private readonly FailureLog _log = FailureLog.Default;
    private SingleInstance? _singleInstance;
    private Task<EmbeddedApiHost>? _hostStart;
    private bool _windowClosed;
    private bool _failing;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        RegisterFailureHandlers();

        _singleInstance = SingleInstance.TryAcquire();

        if (_singleInstance is null)
        {
            SingleInstance.ActivateExisting();
            Shutdown();
            return;
        }

        try
        {
            // The window comes first: startup takes seconds, and the user must see that the app is opening.
            var window = new MainWindow(_log);
            MainWindow = window;
            window.Closed += (_, _) => _windowClosed = true;
            window.Show();

            _singleInstance.ListenForActivation(() => Dispatcher.BeginInvoke(window.BringToFront));

            // Throws if the runtime is missing, before any work that would only have to be undone.
            CoreWebView2Environment.GetAvailableBrowserVersionString();

            _hostStart = Task.Run(StartHostAsync);
            var host = await _hostStart;

            if (!_windowClosed)
            {
                await window.LoadAppAsync(host.Url, AppPaths.WebView2UserData);
            }
        }
        catch (FrontendNotFoundException exception)
        {
#if DEBUG
            ExitWithFailure(UiText.FrontendMissingInDebug, exception);
#else
            ExitWithFailure(UiText.FrontendMissing, exception);
#endif
        }
        catch (DatabaseMigrationException exception)
        {
            ExitWithFailure(UiText.DatabaseFailed, exception);
        }
        catch (WebView2RuntimeNotFoundException exception)
        {
            ExitWithFailure(UiText.WebView2Missing, exception);
        }
        catch (Exception exception) when (!_windowClosed)
        {
            ExitWithFailure(UiText.StartFailed, exception);
        }
        catch (Exception exception)
        {
            // The user closed the window during startup, so there is nobody to tell.
            _log.Write(LogSource, "Startup failed after the window was closed.", exception);
        }
    }

    // A question here would hold up Windows shutting down, with nobody there to answer it.
    protected override void OnSessionEnding(SessionEndingCancelEventArgs e)
    {
        (MainWindow as MainWindow)?.CloseWithoutAsking();
        base.OnSessionEnding(e);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        // Failures exit with code 1, and a second launch never starts a host, so neither logs this line.
        if (StopHost() && e.ApplicationExitCode == 0)
        {
            _log.Write(LogSource, "Closed cleanly.");
        }

        _singleInstance?.Dispose();
        base.OnExit(e);
    }

    private async Task<EmbeddedApiHost> StartHostAsync()
    {
        var host = await EmbeddedApiHost.StartAsync(
            AppPaths.ContentRoot,
            AppPaths.WebRoot,
            AppDataPaths.Database,
            _log);

        // Here, not after the await in OnStartup: that continuation never runs if the window closes during startup.
        _log.Write(LogSource, $"Started. Version {AppVersion.Full}, port {host.Url.Port}.");

        return host;
    }

    /// <returns>Whether a running host stopped within the time limit.</returns>
    private bool StopHost()
    {
        if (_hostStart is not { } hostStart)
        {
            return false;
        }

        try
        {
            // Off the UI thread, because blocking it while awaiting could deadlock. The wait is bounded so a
            // stuck host can't keep the process alive, and it also covers a host that is still starting.
            var stopped = Task.Run(async () =>
            {
                var host = await hostStart;
                await host.DisposeAsync();
            }).Wait(HostStopTimeout);

            if (!stopped)
            {
                _log.Write(LogSource, "The API did not stop in time.");
            }

            return stopped;
        }
        catch (Exception exception) when (!hostStart.IsFaulted)
        {
            _log.Write(LogSource, "The API failed while stopping.", exception);
            return false;
        }
        catch (Exception)
        {
            // It never started. That failure has already been logged and shown.
            return false;
        }
    }

    private void RegisterFailureHandlers()
    {
        DispatcherUnhandledException += OnDispatcherUnhandledException;

        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
            _log.Write(LogSource, "Unhandled exception; the process is terminating.", e.ExceptionObject as Exception);

        TaskScheduler.UnobservedTaskException += (_, e) =>
        {
            _log.Write(LogSource, "Unobserved task exception.", e.Exception);
            e.SetObserved();
        };
    }

    private void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        e.Handled = true;

        // The dialog runs a nested message loop, so another exception could arrive while it is open.
        if (_failing)
        {
            _log.Write(LogSource, "Unhandled exception while already failing.", e.Exception);
            return;
        }

        ExitWithFailure(UiText.UnexpectedError, e.Exception);
    }

    private void ExitWithFailure(string message, Exception exception)
    {
        _failing = true;
        (MainWindow as MainWindow)?.CloseWithoutAsking();
        _log.Write(LogSource, "A failure ended the app.", exception);
        FailureDialog.ShowMessage(message);
        Shutdown(1);
    }
}
