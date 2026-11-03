using System.Windows;
using System.Windows.Threading;
using EggsApp.Api.Hosting;
using Microsoft.Web.WebView2.Core;

namespace EggsApp.Desktop;

public partial class App : Application
{
    private const string LogSource = "Desktop";

    private static readonly TimeSpan HostStopTimeout = TimeSpan.FromSeconds(6);

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

            _hostStart = Task.Run(() => EmbeddedApiHost.StartAsync(AppPaths.ContentRoot, AppPaths.WebRoot, _log));
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

    protected override void OnExit(ExitEventArgs e)
    {
        StopHost();
        _singleInstance?.Dispose();
        base.OnExit(e);
    }

    private void StopHost()
    {
        if (_hostStart is not { } hostStart)
        {
            return;
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
        }
        catch (Exception exception) when (!hostStart.IsFaulted)
        {
            _log.Write(LogSource, "The API failed while stopping.", exception);
        }
        catch (Exception)
        {
            // It never started. That failure has already been logged and shown.
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
        _log.Write(LogSource, "A failure ended the app.", exception);
        FailureDialog.ShowMessage(message);
        Shutdown(1);
    }
}
