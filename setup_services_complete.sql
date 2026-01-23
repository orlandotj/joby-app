-- ========================================
-- JOBY APP - CONFIGURAÇÃO COMPLETA DE SERVIÇOS
-- ========================================
-- Execute este script no SQL Editor do Supabase

-- ========================================
-- 1. CRIAR/ATUALIZAR TABELA SERVICES
-- ========================================

-- Remover tabela existente se necessário (cuidado em produção!)
-- DROP TABLE IF EXISTS public.services CASCADE;

CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Informações básicas
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  
  -- Preços e unidades
  price NUMERIC(10,2) NOT NULL,
  price_unit TEXT NOT NULL DEFAULT 'hora', -- 'hora', 'dia', 'projeto', 'metro'
  
  -- Área de trabalho
  work_area TEXT, -- Localização onde o serviço é oferecido
  duration TEXT, -- Tempo estimado do serviço
  
  -- Serviços adicionais (boolean flags)
  home_service BOOLEAN DEFAULT false, -- Atende em domicílio
  emergency_service BOOLEAN DEFAULT false, -- Atendimento emergencial
  travel_service BOOLEAN DEFAULT false, -- Viaja para outras cidades
  overtime_service BOOLEAN DEFAULT false, -- Trabalha fora do horário
  
  -- Taxas adicionais
  home_service_fee NUMERIC(10,2), -- Taxa adicional para domicílio
  emergency_service_fee NUMERIC(10,2), -- Taxa adicional emergência
  travel_fee NUMERIC(10,2), -- Taxa adicional viagem
  overtime_fee NUMERIC(10,2), -- Taxa adicional hora extra
  
  -- Horários disponíveis (JSON array)
  available_hours JSONB DEFAULT '[]'::jsonb,
  
  -- Imagem do serviço
  image TEXT,
  
  -- Status e metadata
  is_active BOOLEAN DEFAULT true,
  views INTEGER DEFAULT 0,
  bookings_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- 2. ADICIONAR COLUNAS FALTANTES (se já existir a tabela)
-- ========================================

DO $$ 
BEGIN
    -- Adicionar work_area se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'services' AND column_name = 'work_area') THEN
        ALTER TABLE public.services ADD COLUMN work_area TEXT;
    END IF;
    
    -- Adicionar duration se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'services' AND column_name = 'duration') THEN
        ALTER TABLE public.services ADD COLUMN duration TEXT;
    END IF;
    
    -- Adicionar home_service se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'services' AND column_name = 'home_service') THEN
        ALTER TABLE public.services ADD COLUMN home_service BOOLEAN DEFAULT false;
    END IF;
    
    -- Adicionar emergency_service se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'services' AND column_name = 'emergency_service') THEN
        ALTER TABLE public.services ADD COLUMN emergency_service BOOLEAN DEFAULT false;
    END IF;
    
    -- Adicionar travel_service se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'services' AND column_name = 'travel_service') THEN
        ALTER TABLE public.services ADD COLUMN travel_service BOOLEAN DEFAULT false;
    END IF;
    
    -- Adicionar overtime_service se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'services' AND column_name = 'overtime_service') THEN
        ALTER TABLE public.services ADD COLUMN overtime_service BOOLEAN DEFAULT false;
    END IF;
    
    -- Adicionar home_service_fee se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'services' AND column_name = 'home_service_fee') THEN
        ALTER TABLE public.services ADD COLUMN home_service_fee NUMERIC(10,2);
    END IF;
    
    -- Adicionar emergency_service_fee se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'services' AND column_name = 'emergency_service_fee') THEN
        ALTER TABLE public.services ADD COLUMN emergency_service_fee NUMERIC(10,2);
    END IF;
    
    -- Adicionar travel_fee se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'services' AND column_name = 'travel_fee') THEN
        ALTER TABLE public.services ADD COLUMN travel_fee NUMERIC(10,2);
    END IF;
    
    -- Adicionar overtime_fee se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'services' AND column_name = 'overtime_fee') THEN
        ALTER TABLE public.services ADD COLUMN overtime_fee NUMERIC(10,2);
    END IF;
    
    -- Adicionar available_hours se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'services' AND column_name = 'available_hours') THEN
        ALTER TABLE public.services ADD COLUMN available_hours JSONB DEFAULT '[]'::jsonb;
    END IF;
    
    -- Adicionar image se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'services' AND column_name = 'image') THEN
        ALTER TABLE public.services ADD COLUMN image TEXT;
    END IF;
    
    -- Adicionar views se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'services' AND column_name = 'views') THEN
        ALTER TABLE public.services ADD COLUMN views INTEGER DEFAULT 0;
    END IF;
    
    -- Adicionar bookings_count se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'services' AND column_name = 'bookings_count') THEN
        ALTER TABLE public.services ADD COLUMN bookings_count INTEGER DEFAULT 0;
    END IF;
    
    -- Renomear unit para price_unit se necessário
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'services' AND column_name = 'unit')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'services' AND column_name = 'price_unit') THEN
        ALTER TABLE public.services RENAME COLUMN unit TO price_unit;
    END IF;
    
    RAISE NOTICE 'Colunas da tabela services verificadas e atualizadas';
END $$;

-- ========================================
-- 3. CRIAR ÍNDICES
-- ========================================

CREATE INDEX IF NOT EXISTS idx_services_user_id ON public.services(user_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON public.services(category);
CREATE INDEX IF NOT EXISTS idx_services_is_active ON public.services(is_active);
CREATE INDEX IF NOT EXISTS idx_services_price ON public.services(price);
CREATE INDEX IF NOT EXISTS idx_services_work_area ON public.services(work_area);
CREATE INDEX IF NOT EXISTS idx_services_home_service ON public.services(home_service);
CREATE INDEX IF NOT EXISTS idx_services_emergency_service ON public.services(emergency_service);
CREATE INDEX IF NOT EXISTS idx_services_created_at ON public.services(created_at DESC);

-- ========================================
-- 4. RLS POLICIES PARA SERVICES
-- ========================================

-- Habilitar RLS
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Services are viewable by everyone" ON public.services;
DROP POLICY IF EXISTS "Users can insert their own services" ON public.services;
DROP POLICY IF EXISTS "Users can update their own services" ON public.services;
DROP POLICY IF EXISTS "Users can delete their own services" ON public.services;

-- Policy para visualização pública
CREATE POLICY "Services are viewable by everyone"
ON public.services FOR SELECT
TO public
USING (is_active = true);

-- Policy para inserção (apenas usuários autenticados)
CREATE POLICY "Users can insert their own services"
ON public.services FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy para atualização (apenas próprio usuário)
CREATE POLICY "Users can update their own services"
ON public.services FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy para deleção (apenas próprio usuário)
CREATE POLICY "Users can delete their own services"
ON public.services FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ========================================
-- 5. TRIGGER PARA UPDATED_AT
-- ========================================

CREATE OR REPLACE FUNCTION update_services_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS services_updated_at ON public.services;

CREATE TRIGGER services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION update_services_updated_at();

-- ========================================
-- 6. VIEWS ÚTEIS
-- ========================================

-- View para serviços com informações do profissional
CREATE OR REPLACE VIEW public.services_with_professional AS
SELECT 
  s.*,
  p.name as professional_name,
  p.profession,
  p.avatar as professional_avatar,
  p.rating as professional_rating,
  p.total_reviews,
  p.location as professional_location
FROM public.services s
JOIN public.profiles p ON s.user_id = p.id
WHERE s.is_active = true
ORDER BY s.created_at DESC;

-- View para serviços populares
CREATE OR REPLACE VIEW public.popular_services AS
SELECT 
  s.*,
  p.name as professional_name,
  p.avatar as professional_avatar,
  p.rating as professional_rating
FROM public.services s
JOIN public.profiles p ON s.user_id = p.id
WHERE s.is_active = true
ORDER BY s.bookings_count DESC, s.views DESC
LIMIT 20;

-- ========================================
-- 7. FUNÇÃO PARA INCREMENTAR VIEWS
-- ========================================

CREATE OR REPLACE FUNCTION increment_service_views(service_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.services
  SET views = views + 1
  WHERE id = service_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- 8. VERIFICAR ESTRUTURA FINAL
-- ========================================

SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'services'
ORDER BY ordinal_position;

-- ========================================
-- 9. DADOS DE EXEMPLO (OPCIONAL)
-- ========================================

-- Descomente para inserir dados de teste
/*
INSERT INTO public.services (
  user_id, 
  title, 
  description, 
  category, 
  price, 
  price_unit,
  work_area,
  duration,
  home_service,
  emergency_service,
  home_service_fee,
  emergency_service_fee,
  available_hours
) VALUES (
  (SELECT id FROM public.profiles LIMIT 1), -- Pega o primeiro usuário
  'Instalação Elétrica Residencial',
  'Instalação completa de sistema elétrico em residências. Inclui: tomadas, interruptores, quadro de distribuição e cabeamento.',
  'Elétrica',
  150.00,
  'hora',
  'Brasília e região',
  '2-4 horas',
  true,
  true,
  50.00,
  100.00,
  '["08:00-12:00", "14:00-18:00"]'::jsonb
);
*/

-- ========================================
-- SETUP COMPLETO!
-- ========================================

SELECT 
  'Setup de serviços concluído com sucesso!' as status,
  COUNT(*) as total_services
FROM public.services;
