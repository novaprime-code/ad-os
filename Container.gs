/**
 * Container.gs
 * Tiny service locator. Lazily builds repositories, providers, and services and
 * memoizes them for the duration of one execution. Switching providers = Settings.
 *
 * Usage: Container.tasks(), Container.ai().chat(...), Container.inboxService().capture(...)
 */

const Container = (function () {
  let _c = {};

  function once(key, factory) {
    if (!(key in _c)) _c[key] = factory();
    return _c[key];
  }

  // Repositories
  const repos = () => once('repos', () => ({
    inbox: new InboxRepository(),
    tasks: new TaskRepository(),
    projects: new ProjectRepository(),
    events: new EventRepository(),
    goals: new GoalRepository(),
    habits: new HabitRepository(),
    ideas: new IdeaRepository(),
    learning: new LearningRepository(),
    vocab: new VocabRepository(),
    applications: new ApplicationRepository(),
    health: new HealthRepository(),
    sessions: new SessionRepository(),
    reviews: new ReviewRepository(),
    stats: new StatsRepository()
  }));

  // Providers
  const ai = () => once('ai', buildAI);
  const messaging = () => once('messaging', buildMessaging);

  // Services
  const inboxService = () => once('inboxService', () => new InboxService(repos(), { ai }));
  const taskService = () => once('taskService', () => new TaskService(repos()));
  const ideaService = () => once('ideaService', () => new IdeaService(repos()));
  const learningService = () => once('learningService', () => new LearningService(repos()));
  const searchService = () => once('searchService', () => new SearchService(repos()));
  const statsService = () => once('statsService', () => new GamificationService(repos()));
  const vocabService = () => once('vocabService', () => new VocabService(repos()));

  function reset() { _c = {}; clearConfigCache(); Cache.invalidateAll(); }

  return {
    repos,
    tasks: () => repos().tasks,
    ai, messaging,
    inboxService, taskService, ideaService, learningService, searchService, statsService, vocabService,
    reset
  };
})();